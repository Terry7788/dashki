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
  Plus,
  Trash2,
  Pencil,
  Search,
  Utensils,
  Camera as CameraIcon,
  Loader2,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassModal,
  MicroLabel,
  MonoNum,
  SegmentedControl,
  EmptyState,
} from '../components/ui';
import {
  getFoods,
  createFood,
  updateFood,
  deleteFood,
  scanFoodLabel,
} from '../lib/api';
import type { Food, Unit } from '../lib/types';
import PageHeader from '../components/PageHeader';
import { captureLabel, isNativePlatform } from '../lib/native';

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
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader
        title="Foods"
        subtitle={`${foods.length} in your database`}
        back="/more"
        trailing={
          <div style={{ display: 'flex', gap: 6 }}>
            <GlassButton
              variant="soft"
              size="sm"
              onClick={handleScanLabel}
              disabled={scanning}
              title="Scan a nutrition label"
            >
              {scanning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CameraIcon size={14} />
              )}
            </GlassButton>
            <GlassButton variant="primary" size="sm" onClick={openAdd}>
              <Plus size={14} style={{ marginRight: 2 }} />
              New
            </GlassButton>
          </div>
        }
      />

      <div
        style={{
          padding: '0 1rem 1rem 1rem',
          maxWidth: 480,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-placeholder)',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={handleQuery}
            placeholder="Search foods…"
            style={{
              width: '100%',
              padding: '10px 10px 10px 32px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: 60, borderRadius: 8 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState>
            {query.trim() ? 'No foods match.' : 'Your database is empty.'} Tap{' '}
            <strong>New</strong> to add one.
          </EmptyState>
        ) : (
          <GlassCard padding={false}>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {filtered.map((food, idx) => (
                <li key={food.id}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      borderTop:
                        idx === 0 ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    <Utensils
                      size={16}
                      style={{
                        color: 'var(--color-muted-foreground)',
                        flexShrink: 0,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(food)}
                      className="cursor-pointer text-left"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        fontFamily: 'inherit',
                        color: 'var(--color-foreground)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {food.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-muted-foreground)',
                          fontFamily: 'var(--font-mono)',
                          marginTop: 2,
                        }}
                      >
                        {Math.round(food.calories ?? food.calories_per_100g ?? 0)} kcal ·{' '}
                        {(food.protein ?? food.protein_per_100g ?? 0).toFixed(1)}g protein
                        {' · per '}
                        {food.base_amount ?? food.baseAmount ?? 100}{' '}
                        {food.base_unit ?? food.baseUnit ?? 'g'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(food)}
                      aria-label="Edit"
                      className="cursor-pointer"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 4,
                        background: 'transparent',
                        border: 0,
                        color: 'var(--color-muted-foreground)',
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(food)}
                      aria-label="Delete"
                      className="cursor-pointer"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 4,
                        background: 'transparent',
                        border: 0,
                        color: 'var(--color-muted-foreground)',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        {/* Camera scan hint + error display */}
        <div
          style={{
            padding: 12,
            background: 'var(--color-surface-warm)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <CameraIcon
              size={14}
              style={{ color: 'var(--color-primary)', marginTop: 1, flexShrink: 0 }}
            />
            <div>
              <strong style={{ color: 'var(--color-foreground)' }}>
                Tap the camera icon
              </strong>{' '}
              to scan a nutrition label. The AI reads the panel and prefills a
              new food for you.
              {!isNativePlatform() && (
                <>
                  {' '}
                  In browser dev the file picker opens; on a real device the
                  camera launches.
                </>
              )}
            </div>
          </div>
          {scanError && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 8px',
                background: 'rgba(201,28,43,0.08)',
                border: '1px solid rgba(201,28,43,0.3)',
                borderRadius: 4,
                color: 'var(--color-critical)',
                fontSize: 11,
              }}
            >
              {scanError}
            </div>
          )}
        </div>
      </div>

      {/* Add / edit modal — same form */}
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
    </div>
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
}: {
  isOpen: boolean;
  title: string;
  form: NewFoodForm;
  setForm: (f: NewFoodForm) => void;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
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
