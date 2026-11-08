// Mobile foods page — port of web/src/app/foods/page.tsx (~1943 lines).
// Scoped to ~400 lines: search/list + view/edit/delete + simple new-food form.
// Skipped from web:
//   - Camera-based nutrition label scanning (DSHKI-62 — Capacitor camera)
//   - AI estimate-from-name (skipped for mobile MVP; backend route still
//     exists if we want to add it later)
//   - Tag filtering (web has FOOD_TAGS rail; mobile uses plain text search)

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  GlassButton,
  GlassInput,
  GlassModal,
  MicroLabel,
  MonoNum,
  SegmentedControl,
} from '../components/ui';
import {
  getFoods,
  createFood,
  updateFood,
  deleteFood,
  scanFoodLabel,
} from '../lib/api';
import type { Food, Unit } from '../lib/types';
import { FoldPager, paged } from '../components/Fold';
import { captureLabel, } from '../lib/native';

interface NewFoodForm {
  name: string;
  base_amount: number;
  base_unit: Unit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  serving_size_g: number | null;
}

const EMPTY_FORM: NewFoodForm = {
  name: '',
  base_amount: 100,
  base_unit: 'g',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  serving_size_g: null,
};

export default function FoodsScreen() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Food | null>(null);

  // Form
  const [form, setForm] = useState<NewFoodForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scanning state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFoods();
      setFoods(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter((f) => f.name.toLowerCase().includes(q));
  }, [foods, query]);

  const rows = paged(filtered, page, 9);

  // Debounce — only filters client-side so no server hit needed
  function handleQuery(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(v), 100);
    setQuery(v);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setError(null);
    setAddOpen(true);
  }

  async function handleScanLabel() {
    setScanning(true);
    setScanError(null);
    try {
      const imageDataUrl = await captureLabel();
      if (!imageDataUrl) {
        setScanning(false);
        return; // user cancelled
      }
      const scanned = await scanFoodLabel(imageDataUrl);
      // Prefill the new-food form with what the AI extracted.
      setForm({
        name: '', // user adds the brand/name themselves
        base_amount: scanned.servingSize ?? 100,
        base_unit: scanned.servingSize ? 'serving' : 'g',
        calories: scanned.calories,
        protein: scanned.protein,
        carbs: scanned.carbs,
        fat: scanned.fat,
        fiber: scanned.fiber,
        serving_size_g: scanned.servingSize,
      });
      setAddOpen(true);
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Could not scan label. Try again or enter manually.',
      );
    } finally {
      setScanning(false);
    }
  }

  function openEdit(food: Food) {
    setForm({
      name: food.name,
      base_amount: food.base_amount ?? food.baseAmount ?? 100,
      base_unit: (food.base_unit ?? food.baseUnit ?? 'g') as Unit,
      calories: food.calories ?? food.calories_per_100g ?? 0,
      protein: food.protein ?? food.protein_per_100g ?? 0,
      carbs: food.carbs ?? food.carbs_per_100g ?? 0,
      fat: food.fat ?? food.fat_per_100g ?? 0,
      fiber: food.fiber ?? food.fiber_per_100g ?? 0,
      serving_size_g: food.serving_size_g ?? null,
    });
    setError(null);
    setEditFood(food);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (form.base_amount <= 0) {
      setError('Base amount must be greater than 0');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        base_amount: form.base_amount,
        base_unit: form.base_unit,
        calories: form.calories,
        protein: form.protein,
        carbs: form.carbs,
        fat: form.fat,
        fiber: form.fiber,
        serving_size_g: form.serving_size_g,
        calories_per_100g: form.calories,
        protein_per_100g: form.protein,
        carbs_per_100g: form.carbs,
        fat_per_100g: form.fat,
        fiber_per_100g: form.fiber,
      };

      if (editFood) {
        await updateFood(editFood.id, payload);
        setEditFood(null);
      } else {
        await createFood(payload);
        setAddOpen(false);
      }
      setForm(EMPTY_FORM);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(food: Food) {
    setSaving(true);
    try {
      await deleteFood(food.id);
      await fetchAll();
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <section className="fd-panel fd-fill" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 'none', gap: 6 }}><b className="fd-title" style={{ flex: 1 }}>Foods</b><button type="button" className="fd-btn line" onClick={handleScanLabel} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan'}</button><button type="button" className="fd-btn primary" onClick={openAdd}>+ New</button></div>
        {scanError && <span style={{ fontSize: 12, color: '#F0A46C' }}>{scanError}</span>}
        <input className="fd-input" aria-label="Search foods" placeholder="Search foods" value={query} onChange={(e) => { handleQuery(e); setPage(0); }} />
        <div className="fd-list">
          {filtered.length === 0 && <p className="fd-mute" style={{ fontSize: 13 }}>{loading ? 'Loading…' : 'No foods found'}</p>}
          {rows.slice.map((food) => (
            <button key={food.id} type="button" className="fd-row fd-tap" onClick={() => openEdit(food)}>
              <span className="fd-col"><span className="fd-row-title" style={{ fontSize: 13 }}>{food.name}</span><span className="fd-row-sub" style={{ fontSize: 11 }}>{Math.round(food.protein ?? food.protein_per_100g ?? 0)} g protein</span></span>
              <span className="fd-mono" style={{ flex: 'none', fontSize: 12 }}>{Math.round(food.calories ?? food.calories_per_100g ?? 0)} kcal</span>
            </button>
          ))}
        </div>
        <FoldPager page={rows.page} pages={rows.pages} total={filtered.length} from={rows.from} to={rows.to} onPage={setPage} />
      </section>


<FoodFormModal
        isOpen={addOpen || editFood !== null}
        title={editFood ? 'Edit food' : 'New food'}
        form={form}
        setForm={setForm}
        error={error}
        saving={saving}
        onCancel={() => {
          setAddOpen(false);
          setEditFood(null);
          setError(null);
        }}
        onSave={handleSave}
        onDelete={editFood ? () => { const f = editFood; setEditFood(null); setConfirmDelete(f); } : undefined}
      />

      {/* Delete confirmation */}
      <GlassModal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this food?"
        size="sm"
        leadingFooter={
          <GlassButton
            variant="danger"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            disabled={saving}
          >
            {saving ? 'Deleting…' : 'Delete'}
          </GlassButton>
        }
        footer={
          <GlassButton variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </GlassButton>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          {confirmDelete && (
            <>
              <strong style={{ color: 'var(--color-foreground)' }}>
                {confirmDelete.name}
              </strong>{' '}
              will be removed from your food database. Existing journal entries
              that reference it stay intact (they store a snapshot).
            </>
          )}
        </p>
      </GlassModal>
    </>
  );
}

function FoodFormModal({
  isOpen,
  title,
  form,
  setForm,
  error,
  saving,
  onCancel,
  onSave,
  onDelete,
}: {
  isOpen: boolean;
  title: string;
  form: NewFoodForm;
  setForm: (f: NewFoodForm) => void;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  function patch<K extends keyof NewFoodForm>(k: K, v: NewFoodForm[K]) {
    setForm({ ...form, [k]: v });
  }
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="md"
      mobileFullscreen
      footer={
        <>
          {onDelete && <GlassButton variant="danger" onClick={onDelete} disabled={saving}>Delete</GlassButton>}
          <GlassButton variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={onSave}
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <GlassInput
          label="Name"
          value={form.name}
          onChange={(e) => patch('name', e.target.value)}
          placeholder="Greek yoghurt"
          required
        />

        <div className="flex gap-2">
          <GlassInput
            label="Base amount"
            type="number"
            inputMode="decimal"
            step="1"
            value={form.base_amount}
            onChange={(e) => patch('base_amount', Number(e.target.value) || 0)}
            className="flex-1"
          />
          <div className="flex-1">
            <MicroLabel>Unit</MicroLabel>
            <div className="mt-2">
              <SegmentedControl<Unit>
                value={form.base_unit}
                options={[
                  { value: 'g', label: 'g' },
                  { value: 'ml', label: 'ml' },
                  { value: 'serving', label: 'serving' },
                ]}
                onChange={(v) => patch('base_unit', v)}
              />
            </div>
          </div>
        </div>

        <div>
          <MicroLabel>
            Nutrition per {form.base_amount} {form.base_unit}
          </MicroLabel>
          <div
            className="mt-2"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
          >
            <GlassInput
              label="Calories (kcal)"
              type="number"
              inputMode="numeric"
              value={form.calories}
              onChange={(e) => patch('calories', Number(e.target.value) || 0)}
            />
            <GlassInput
              label="Protein (g)"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.protein}
              onChange={(e) => patch('protein', Number(e.target.value) || 0)}
            />
            <GlassInput
              label="Carbs (g)"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.carbs}
              onChange={(e) => patch('carbs', Number(e.target.value) || 0)}
            />
            <GlassInput
              label="Fat (g)"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.fat}
              onChange={(e) => patch('fat', Number(e.target.value) || 0)}
            />
            <GlassInput
              label="Fibre (g)"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.fiber}
              onChange={(e) => patch('fiber', Number(e.target.value) || 0)}
            />
            <GlassInput
              label="Serving size (g)"
              type="number"
              inputMode="numeric"
              value={form.serving_size_g ?? ''}
              onChange={(e) =>
                patch(
                  'serving_size_g',
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              placeholder="Optional"
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-muted-foreground)',
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            <MonoNum size={11}>
              {form.calories} kcal · {form.protein.toFixed(1)}g protein
            </MonoNum>
            {' per '}
            {form.base_amount} {form.base_unit}
            {form.serving_size_g != null && (
              <span> · serving = {form.serving_size_g} g</span>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(201,28,43,0.08)',
              border: '1px solid rgba(201,28,43,0.3)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-critical)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </GlassModal>
  );
}
