'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Search, Leaf } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
import { getFoods, createFood, updateFood, deleteFood } from '@/lib/api';
import type { Food } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type BaseUnit = 'grams' | 'ml' | 'servings';

interface FoodFormData {
  name: string;
  base_amount: string;
  base_unit: BaseUnit;
  calories_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
  serving_size_g: string;
}

const defaultForm = (): FoodFormData => ({
  name: '',
  base_amount: '100',
  base_unit: 'grams',
  calories_per_100g: '',
  protein_per_100g: '',
  carbs_per_100g: '',
  fat_per_100g: '',
  serving_size_g: '',
});

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  calories_per_100g?: string;
}

function validate(form: FoodFormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.calories_per_100g || isNaN(Number(form.calories_per_100g)) || Number(form.calories_per_100g) < 0) {
    errors.calories_per_100g = 'Valid calories required';
  }
  return errors;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FoodSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-3xl" />
      ))}
    </div>
  );
}

// ─── Food Form Modal ──────────────────────────────────────────────────────────

interface FoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingFood: Food | null;
  onSaved: (food: Food, isEdit: boolean) => void;
}

function FoodModal({ isOpen, onClose, editingFood, onSaved }: FoodModalProps) {
  const [form, setForm] = useState<FoodFormData>(defaultForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (editingFood) {
      setForm({
        name: editingFood.name,
        base_amount: '100',
        base_unit: 'grams',
        calories_per_100g: String(editingFood.calories_per_100g ?? editingFood.calories ?? ''),
        protein_per_100g: String(editingFood.protein_per_100g ?? editingFood.protein ?? ''),
        carbs_per_100g: String(editingFood.carbs_per_100g ?? ''),
        fat_per_100g: String(editingFood.fat_per_100g ?? ''),
        serving_size_g: editingFood.serving_size_g != null ? String(editingFood.serving_size_g) : '',
      });
    } else {
      setForm(defaultForm());
    }
    setErrors({});
    setServerError('');
  }, [editingFood, isOpen]);

  function set(field: keyof FoodFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit() {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setServerError('');
    const payload = {
      name: form.name.trim(),
      calories_per_100g: Number(form.calories_per_100g),
      protein_per_100g: Number(form.protein_per_100g) || 0,
      carbs_per_100g: Number(form.carbs_per_100g) || 0,
      fat_per_100g: Number(form.fat_per_100g) || 0,
      serving_size_g: form.serving_size_g ? Number(form.serving_size_g) : undefined,
    };

    try {
      let food: Food;
      if (editingFood) {
        food = await updateFood(editingFood.id, payload);
        onSaved(food, true);
      } else {
        food = await createFood(payload);
        onSaved(food, false);
      }
      onClose();
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingFood ? 'Edit Food' : 'Add Food'}
      size="md"
    >
      <div className="space-y-4">
        <GlassInput
          label="Food Name *"
          placeholder="e.g. Chicken Breast"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
        {errors.name && <p className="text-xs text-red-400 -mt-2 pl-1">{errors.name}</p>}

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <GlassInput
            label="Base Amount"
            type="number"
            value={form.base_amount}
            onChange={(e) => set('base_amount', e.target.value)}
            min={1}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-500 dark:text-white/60 pl-1">Unit</label>
            <select
              value={form.base_unit}
              onChange={(e) => set('base_unit', e.target.value as BaseUnit)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-black/[0.04] border border-black/[0.10] text-gray-900 dark:bg-white/10 dark:border-white/20 dark:text-white rounded-xl sm:rounded-2xl text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200"
            >
              <option value="grams">Grams</option>
              <option value="ml">ml</option>
              <option value="servings">Servings</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div>
            <GlassInput
              label="Calories (per 100g) *"
              type="number"
              value={form.calories_per_100g}
              onChange={(e) => set('calories_per_100g', e.target.value)}
              min={0}
              step={0.1}
              placeholder="0"
            />
            {errors.calories_per_100g && (
              <p className="text-xs text-red-400 mt-1 pl-1">{errors.calories_per_100g}</p>
            )}
          </div>
          <GlassInput
            label="Protein (per 100g)"
            type="number"
            value={form.protein_per_100g}
            onChange={(e) => set('protein_per_100g', e.target.value)}
            min={0}
            step={0.1}
            placeholder="0"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <GlassInput
            label="Carbs (per 100g)"
            type="number"
            value={form.carbs_per_100g}
            onChange={(e) => set('carbs_per_100g', e.target.value)}
            min={0}
            step={0.1}
            placeholder="0"
          />
          <GlassInput
            label="Fat (per 100g)"
            type="number"
            value={form.fat_per_100g}
            onChange={(e) => set('fat_per_100g', e.target.value)}
            min={0}
            step={0.1}
            placeholder="0"
          />
        </div>

        <GlassInput
          label="Serving Size (g) — optional"
          type="number"
          value={form.serving_size_g}
          onChange={(e) => set('serving_size_g', e.target.value)}
          min={1}
          placeholder="e.g. 30 for 1 slice"
        />

        {serverError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{serverError}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : editingFood ? 'Update' : 'Add Food'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  food: Food | null;
  onDeleted: (id: number) => void;
}

function DeleteModal({ isOpen, onClose, food, onDeleted }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!food) return;
    setDeleting(true);
    setError('');
    try {
      await deleteFood(food.id);
      onDeleted(food.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Delete Food" size="sm">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-white/70 text-sm">
          Are you sure you want to delete <span className="text-gray-900 dark:text-white font-semibold">{food?.name}</span>?
          This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="danger" className="flex-1" onClick={handleConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Food Row ─────────────────────────────────────────────────────────────────

interface FoodRowProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
}

function FoodRow({ food, onEdit, onDelete }: FoodRowProps) {
  const calories = food.calories ?? food.calories_per_100g ?? 0;
  const protein = food.protein ?? food.protein_per_100g ?? 0;
  const carbs = food.carbs_per_100g ?? 0;
  const fat = food.fat_per_100g ?? 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 rounded-2xl sm:rounded-3xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] transition-all duration-200 group">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{food.name}</p>
        <p className="text-xs text-white/50 mt-0.5">
          per 100g · {calories} kcal · {protein}g protein
          {food.serving_size_g != null && (
            <span> · serving {food.serving_size_g}g</span>
          )}
        </p>
      </div>

      {/* Macro pills - hidden on mobile, shown on sm+ */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span className="text-xs px-2.5 py-1 rounded-xl bg-orange-500/10 border border-orange-400/20 text-orange-300">
          {carbs}g carbs
        </span>
        <span className="text-xs px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-400/20 text-blue-300">
          {fat}g fat
        </span>
      </div>

      {/* Actions - always visible on mobile */}
      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onEdit(food)}
          className="p-2 rounded-xl text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all duration-200"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(food)}
          className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [deletingFood, setDeletingFood] = useState<Food | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    getFoods()
      .then(setFoods)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const filteredFoods = debouncedQuery.trim()
    ? foods.filter((f) => f.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
    : foods;

  function handleOpenAdd() {
    setEditingFood(null);
    setModalOpen(true);
  }
  function handleEdit(food: Food) {
    setEditingFood(food);
    setModalOpen(true);
  }
  function handleSaved(food: Food, isEdit: boolean) {
    if (isEdit) {
      setFoods((prev) => prev.map((f) => (f.id === food.id ? food : f)));
    } else {
      setFoods((prev) => [food, ...prev]);
    }
  }
  function handleDeleted(id: number) {
    setFoods((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="px-3 sm:px-4 max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-fade-in w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Food Database</h1>
        <GlassButton variant="primary" onClick={handleOpenAdd} className="w-full sm:w-auto">
          <span className="flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add Food</span>
        </GlassButton>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          className="w-full pl-10 sm:pl-11 pr-3 sm:pr-4 py-2.5 sm:py-3 text-sm sm:text-base bg-black/[0.04] border border-black/[0.10] text-gray-900 placeholder-gray-400 dark:bg-white/10 dark:border-white/20 dark:text-white dark:placeholder-white/40 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200"
        />
      </div>

      {/* Stats bar */}
      {!loading && foods.length > 0 && (
        <p className="text-xs sm:text-sm text-gray-400 dark:text-white/40">
          {filteredFoods.length} of {foods.length} food{foods.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400 text-sm">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <FoodSkeleton />
      ) : filteredFoods.length === 0 ? (
        <GlassCard className="text-center py-8 sm:py-12">
          <Leaf className="w-10 h-10 sm:w-12 sm:h-12 text-white/20 mx-auto mb-3 sm:mb-4" />
          <p className="text-white/60 font-medium">
            {query ? 'No foods match your search' : 'No foods yet'}
          </p>
          <p className="text-white/30 text-sm mt-1">
            {query ? 'Try a different search term' : 'Add your first food to get started'}
          </p>
          {!query && (
            <div className="mt-4 sm:mt-6">
              <GlassButton variant="primary" onClick={handleOpenAdd}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Food</span>
              </GlassButton>
            </div>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filteredFoods.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              onEdit={handleEdit}
              onDelete={setDeletingFood}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <FoodModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editingFood={editingFood}
        onSaved={handleSaved}
      />
      <DeleteModal
        isOpen={!!deletingFood}
        onClose={() => setDeletingFood(null)}
        food={deletingFood}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
