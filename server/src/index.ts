import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import OpenAI from 'openai';
import { logger } from './logger';

import { initDb } from './db';
import { setIo } from './socket';
import foodsRouter from './routes/foods';
import mealsRouter from './routes/meals';
import currentMealRouter from './routes/currentMeal';
import journalRouter from './routes/journal';
import gymRouter from './routes/gym';
import todoRouter from './routes/todo';
import weightRouter from './routes/weight';
import stepsRouter from './routes/steps';
import calendarRouter from './routes/calendar';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins: (string | RegExp)[] = [
  process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  'http://localhost:3001',
  /\.vercel\.app$/,
];

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (e.g. curl, Postman)
    if (!origin) return callback(null, true);

    const allowed = allowedOrigins.some((o) =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );

    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ─── Socket.io ───────────────────────────────────────────────────────────────

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  logger.info(`[ws] client connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    logger.info(`[ws] client disconnected: ${socket.id} (${reason})`);
  });
});

// Expose io to route handlers via shared socket module
setIo(io);

// Make io available to route handlers via app.locals (legacy fallback)
app.locals.io = io;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger (dev-friendly)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    logger.info(`[${req.method}] ${req.path}`);
    next();
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── OpenAI ───────────────────────────────────────────────────────────────────

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/foods', foodsRouter);
app.use('/api/meals/saved', mealsRouter);
app.use('/api/meals/current', currentMealRouter);
app.use('/api/journal', journalRouter);
app.use('/api/gym', gymRouter);
app.use('/api/todos', todoRouter);
app.use('/api/weight', weightRouter);
app.use('/api/steps', stepsRouter);
app.use('/api/auth', calendarRouter);
app.use('/api/calendar', calendarRouter);

// ─── Voice Parsing ────────────────────────────────────────────────────────────

app.post('/api/parse-voice-food', async (req: express.Request, res: express.Response) => {
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid text parameter' });
    }

    const prompt = `You are parsing voice input to search for foods in a database. Extract the FOOD NAME and optionally amounts/quantities.

Spoken text: "${text}"

Return ONLY valid JSON (no markdown, no explanations):

If it's a change command (contains "change", "replace", "swap"):
{"command":"change","from":"original food name","to":"new food name"}

Otherwise return food object(s):
Single food: {"name":"Food Name","baseAmount":100,"baseUnit":"grams"}
Multiple foods (separated by "and"/"&"): [{"name":"Food 1","baseAmount":100,"baseUnit":"grams"},{"name":"Food 2","baseAmount":1,"baseUnit":"servings"}]

RULES:
1. Extract food name accurately for database search
2. Extract amounts if mentioned (e.g., "2 apples" -> baseAmount:2, baseUnit:"servings")
3. Extract grams if mentioned (e.g., "200g chicken" -> baseAmount:200, baseUnit:"grams")
4. Extract volume if mentioned (e.g., "250ml coffee" -> baseAmount:250, baseUnit:"ml")
5. Default to 1 serving if no quantity mentioned
6. baseUnit must be one of: "grams", "servings", "ml"

Return JSON only.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that parses food information from spoken text. Always return valid JSON only, no additional text.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '{}';

    let jsonText = responseText;
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (arrayMatch) jsonText = arrayMatch[0];
    else if (objectMatch) jsonText = objectMatch[0];

    const parsed = JSON.parse(jsonText);

    if (parsed.command === 'change' && parsed.from && parsed.to) {
      return res.json({ command: 'change', from: parsed.from, to: parsed.to });
    }

    const foods = Array.isArray(parsed) ? parsed : [parsed];

    const result = foods.map((food: Record<string, unknown>) => {
      let baseAmount = food.baseAmount != null ? Number(food.baseAmount) : null;
      let baseUnit = (typeof food.baseUnit === 'string' && ['grams', 'servings', 'ml'].includes(food.baseUnit))
        ? food.baseUnit
        : null;

      const lowerName = ((food.name as string) || '').toLowerCase();
      const isBeverage = /coffee|latte|cappuccino|flat white|espresso|mocha|americano|tea|juice|soda|drink/.test(lowerName);
      const isFastFood = /burger|sandwich|pizza|wrap|taco/.test(lowerName);

      if (isBeverage && baseUnit !== 'ml') {
        baseUnit = 'ml';
        if (!baseAmount || baseAmount === 1) baseAmount = 250;
      } else if (isFastFood && baseUnit !== 'servings') {
        baseUnit = 'servings';
        baseAmount = baseAmount || 1;
      } else if (!baseUnit) {
        if (baseAmount && baseAmount > 1) baseUnit = 'grams';
        else { baseUnit = 'servings'; baseAmount = baseAmount || 1; }
      } else if (!baseAmount || baseAmount === 1) {
        if (baseUnit === 'grams') baseAmount = 100;
        else if (baseUnit === 'ml') baseAmount = 250;
        else baseAmount = 1;
      }

      return {
        name: food.name || '',
        baseAmount: baseAmount != null ? Number(baseAmount) : null,
        baseUnit: baseUnit || 'grams',
      };
    });

    res.json(result);
  } catch (err) {
    logger.error('[error] POST /api/parse-voice-food', err);
    res.status(500).json({ error: 'Failed to parse voice input', details: (err as Error).message });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Listen ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 4001;

async function start() {
  try {
    await initDb();
    server.listen(PORT, () => {
      logger.info(`[server] Dashki API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('[server] Failed to initialise database:', err);
    process.exit(1);
  }
}

start();

export { io };
