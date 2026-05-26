// Mobile saved meals page — port of web/src/app/meals/page.tsx (~2001 lines).
// Scoped to ~350 lines: list / view items / delete / simple new-meal builder.
// Skipped from web:
//   - Drag-to-reorder ingredient builder
//   - Inline food creation from the picker
//   - Multi-edit / duplicate flows
//   - "Add as today's meal" hand-off (use journal page instead)

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Salad,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassModal,
  Pill,
  MicroLabel,
  MonoNum,
  EmptyState,
} from '../components/ui';
import {
  getSavedMeals,
  getFoods,
  createSavedMeal,
  deleteSavedMeal,
} from '../lib/api';
import type { SavedMeal, Food, Unit } from '../lib/types';
import PageHeader from '../components/PageHeader';

interface DraftItem {
  food: Food;
  quantity: number;
  unit: Unit;
}

export default function MealsScreen() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMeal, setOpenMeal] = useState<SavedMeal | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SavedMeal | null>(null);
  const [saving, setSaving] = useState(false);

  // New meal builder state
  const [draftName, setDraftName] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [foodQuery, setFoodQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSavedMeals();
      setMeals(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (pickerOpen && allFoods.length === 0) {
      getFoods().then(setAllFoods).catch(() => setAllFoods([]));
    }
  }, [pickerOpen, allFoods.length]);

  const filteredFoods = useMemo(() => {
    const q = foodQuery.trim().toLowerCase();
    if (!q) return allFoods.slice(0, 60);
    return allFoods.filter((f) => f.name.toLowerCase().includes(q));
  }, [allFoods, foodQuery]);

  function openAddMeal() {
    setDraftName('');
    setDraftItems([]);
    setError(null);
    setAddOpen(true);
  }

  function addDraftItem(food: Food) {
    const units = food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
    const def = units.find((u) => u.default) ?? units[0];
    const startQty =
      def.unit === 'serving'
        ? 1
        : food.base_amount ?? food.baseAmount ?? 100;
    setDraftItems((prev) => [
      ...prev,
      { food, quantity: startQty, unit: def.unit },
    ]);
    setPickerOpen(false);
    setFoodQuery('');
  }

  function removeDraftItem(idx: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDraftQty(idx: number, qty: number) {
    setDraftItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)),
    );
  }

  async function handleSaveMeal() {
    if (!draftName.trim()) {
      setError('Give the meal a name');
      return;
    }
    if (draftItems.length === 0) {
      setError('Add at least one food');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSavedMeal({
        name: draftName.trim(),
        items: draftItems.map((it) => ({
          food_id: it.food.id,
          quantity: it.quantity,
          unit: it.unit,
        })),
      });
      setAddOpen(false);
      setDraftName('');
      setDraftItems([]);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save meal');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMeal(meal: SavedMeal) {
    setSaving(true);
    try {
      await deleteSavedMeal(meal.id);
      await fetchAll();
    } finally {
      setSaving(false);
      setConfirmDelete(null);
      setOpenMeal(null);
    }
  }

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader
        title="Saved meals"
        subtitle={`${meals.length} templates`}
        back="/more"
        trailing={
          <GlassButton variant="primary" size="sm" onClick={openAddMeal}>
            <Plus size={14} style={{ marginRight: 2 }} />
            New
          </GlassButton>
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
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: 60, borderRadius: 8 }}
              />
            ))}
          </div>
        ) : meals.length === 0 ? (
          <EmptyState>
            No saved meals yet. Tap <strong>New</strong> to create your first.
          </EmptyState>
        ) : (
          <GlassCard padding={false}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {meals.map((meal, idx) => (
                <li key={meal.id}>
                  <button
                    type="button"
                    onClick={() => setOpenMeal(meal)}
                    className="cursor-pointer text-left w-full"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      borderTop:
                        idx === 0 ? 'none' : '1px solid var(--color-border)',
                      background: 'transparent',
                      border: 0,
                      borderTopColor: 'var(--color-border)',
                      borderTopStyle: idx === 0 ? 'none' : 'solid',
                      borderTopWidth: idx === 0 ? 0 : 1,
                      color: 'var(--color-foreground)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Salad
                      size={16}
                      style={{ color: 'var(--color-muted-foreground)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meal.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-muted-foreground)',
                          marginTop: 2,
                        }}
                      >
                        {meal.items?.length ?? 0} items
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      style={{ color: 'var(--color-placeholder)' }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>

      {/* Meal detail modal */}
      <GlassModal
        isOpen={openMeal !== null}
        onClose={() => setOpenMeal(null)}
        title={openMeal?.name ?? ''}
        subtitle={`${openMeal?.items?.length ?? 0} items`}
        size="md"
        leadingFooter={
          openMeal && (
            <GlassButton
              variant="danger"
              onClick={() => setConfirmDelete(openMeal)}
            >
              <Trash2 size={12} style={{ marginRight: 4 }} />
              Delete
            </GlassButton>
          )
        }
        footer={
          <GlassButton variant="primary" onClick={() => setOpenMeal(null)}>
            Close
          </GlassButton>
        }
      >
        {openMeal && (
          <div className="flex flex-col gap-2">
            {(openMeal.items ?? []).map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  background: 'var(--color-surface-warm)',
                  borderRadius: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted-foreground)',
                      marginTop: 2,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {item.quantity ?? item.servings ?? 1}{' '}
                    {item.unit ?? 'serving'}
                    {' · '}
                    {Math.round(item.calories ?? 0)} kcal
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassModal>

      {/* New meal builder */}
      <GlassModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="New saved meal"
        subtitle="Combine foods you eat together"
        size="md"
        mobileFullscreen
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleSaveMeal}
              disabled={saving || !draftName.trim() || draftItems.length === 0}
            >
              {saving ? 'Saving…' : 'Save meal'}
            </GlassButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <GlassInput
            label="Meal name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Morning smoothie"
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <MicroLabel>Items</MicroLabel>
              <Pill tone="neutral">{draftItems.length}</Pill>
            </div>

            {draftItems.length === 0 ? (
              <EmptyState>No items yet.</EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {draftItems.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      background: 'var(--color-surface-warm)',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {it.food.name}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 4,
                          marginTop: 2,
                        }}
                      >
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min={0}
                          value={it.quantity}
                          onChange={(e) =>
                            updateDraftQty(idx, Number(e.target.value) || 0)
                          }
                          style={{
                            width: 60,
                            padding: '2px 6px',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 4,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--color-foreground)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--color-muted-foreground)',
                          }}
                        >
                          {it.unit}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraftItem(idx)}
                      className="cursor-pointer"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 4,
                        background: 'transparent',
                        border: 0,
                        color: 'var(--color-muted-foreground)',
                      }}
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <GlassButton
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="mt-2 w-full"
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              Add food
            </GlassButton>
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

      {/* Food picker for the builder */}
      <GlassModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Pick a food"
        size="md"
        mobileFullscreen
      >
        <div className="flex flex-col gap-3">
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
              autoFocus
              value={foodQuery}
              onChange={(e) => setFoodQuery(e.target.value)}
              placeholder="Find a food…"
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
          </div>
          {filteredFoods.length === 0 ? (
            <EmptyState>No matching foods.</EmptyState>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredFoods.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => addDraftItem(f)}
                    className="cursor-pointer text-left w-full"
                    style={{
                      padding: '10px 12px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
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
                      {f.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-muted-foreground)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}
                    >
                      <MonoNum size={11}>
                        {Math.round(f.calories ?? f.calories_per_100g ?? 0)}
                      </MonoNum>{' '}
                      kcal · per {f.base_amount ?? f.baseAmount ?? 100} {f.base_unit ?? f.baseUnit ?? 'g'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </GlassModal>

      {/* Delete confirmation */}
      <GlassModal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this meal?"
        size="sm"
        leadingFooter={
          <GlassButton
            variant="danger"
            onClick={() => confirmDelete && handleDeleteMeal(confirmDelete)}
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
              The saved meal{' '}
              <strong style={{ color: 'var(--color-foreground)' }}>
                {confirmDelete.name}
              </strong>{' '}
              will be removed. Journal entries that came from it stay.
            </>
          )}
        </p>
      </GlassModal>
    </div>
  );
}
