'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
import {
  getGymSessions,
  createGymSession,
  addExercise,
  addSet,
  getGymRoutine,
  updateRoutineDay,
  syncRoutineToCalendar,
  getWorkoutTemplates,
  createWorkoutTemplate,
  updateWorkoutTemplate,
  deleteWorkoutTemplate,
  startSessionFromTemplate,
  completeGymSession,
} from '@/lib/api';
import type {
  GymSession,
  GymExercise,
  GymSet,
  GymRoutineDay,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '@/lib/types';
import {
  Dumbbell,
  Plus,
  Trash2,
  X,
  ChevronRight,
  CalendarCheck,
  LayoutTemplate,
  Edit2,
  Play,
  CheckCircle2,
} from 'lucide-react';

// ─── Inline API helpers ───────────────────────────────────────────────────────

const BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')) ||
  'http://localhost:4000';

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const b = await res.json();
      msg = b.message || b.error || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

function updateGymSession(id: number, data: Partial<{ name: string; date: string; notes: string }>): Promise<GymSession> {
  return apiRequest(`/api/gym/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

function deleteGymSession(id: number): Promise<void> {
  return apiRequest(`/api/gym/${id}`, { method: 'DELETE' });
}

function updateExercise(exerciseId: number, data: Partial<{ name: string; order_index: number }>): Promise<GymExercise> {
  return apiRequest(`/api/gym/exercises/${exerciseId}`, { method: 'PUT', body: JSON.stringify(data) });
}

function deleteExercise(exerciseId: number): Promise<void> {
  return apiRequest(`/api/gym/exercises/${exerciseId}`, { method: 'DELETE' });
}

function updateSet(setId: number, data: Partial<{ set_number: number; reps: number; weight_kg: number }>): Promise<GymSet> {
  return apiRequest(`/api/gym/sets/${setId}`, { method: 'PUT', body: JSON.stringify(data) });
}

function deleteSet(setId: number): Promise<void> {
  return apiRequest(`/api/gym/sets/${setId}`, { method: 'DELETE' });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Templates Manager ────────────────────────────────────────────────────────

interface ExerciseFormRow {
  name: string;
  sets: number;
  reps: number;
}

function TemplateFormModal({
  template,
  onSave,
  onClose,
}: {
  template: WorkoutTemplate | null;
  onSave: (t: WorkoutTemplate) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [notes, setNotes] = useState(template?.notes ?? '');
  const [exercises, setExercises] = useState<ExerciseFormRow[]>(
    template?.exercises?.length
      ? template.exercises.map((e) => ({
          name: e.exercise_name,
          sets: e.default_sets,
          reps: e.default_reps,
        }))
      : [{ name: '', sets: 3, reps: 10 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRow = () => setExercises((prev) => [...prev, { name: '', sets: 3, reps: 10 }]);

  const removeRow = (idx: number) => setExercises((prev) => prev.filter((_, i) => i !== idx));

  const updateRow = (idx: number, field: keyof ExerciseFormRow, value: string | number) => {
    setExercises((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        notes: notes.trim() || undefined,
        exercises: exercises
          .filter((e) => e.name.trim())
          .map((e) => ({
            name: e.name.trim(),
            sets: Number(e.sets) || 3,
            reps: Number(e.reps) || 10,
          })),
      };

      let result: WorkoutTemplate;
      if (template) {
        result = await updateWorkoutTemplate(template.id, payload);
      } else {
        result = await createWorkoutTemplate(payload);
      }
      onSave(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <GlassModal
      isOpen
      onClose={onClose}
      title={template ? 'Edit Workout' : 'New Workout'}
      size="lg"
    >
      <div className="space-y-4">
        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 px-3 py-2 rounded-xl">{error}</p>
        )}

        <GlassInput
          label="Workout Name"
          placeholder="e.g. Push Day, Legs A, Full Body"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <GlassInput
          label="Notes (optional)"
          placeholder="Any notes about this workout"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Exercises */}
        <div>
          <p className="text-sm font-medium text-white/70 mb-2">Exercises</p>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {exercises.map((ex, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <input
                  value={ex.name}
                  onChange={(e) => updateRow(idx, 'name', e.target.value)}
                  placeholder={`Exercise ${idx + 1}`}
                  className="flex-1 min-w-0 w-full sm:w-auto px-3 py-2 bg-white/[0.06] border border-white/[0.12] rounded-xl
                    text-white text-sm placeholder-white/30
                    focus:outline-none focus:ring-1 focus:ring-[#2E8B57]/50 transition-all"
                />
                <div className="flex items-center gap-1 flex-shrink-0 w-full sm:w-auto justify-between">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={ex.sets}
                      min={1}
                      max={20}
                      onChange={(e) => updateRow(idx, 'sets', parseInt(e.target.value) || 3)}
                      className="w-12 sm:w-14 px-2 py-2 bg-white/[0.06] border border-white/[0.12] rounded-xl
                        text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#2E8B57]/50"
                    />
                    <span className="text-white/40 text-xs">sets</span>
                  </div>
                  <span className="text-white/40 text-xs">×</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={ex.reps}
                      min={1}
                      max={100}
                      onChange={(e) => updateRow(idx, 'reps', parseInt(e.target.value) || 10)}
                      className="w-12 sm:w-14 px-2 py-2 bg-white/[0.06] border border-white/[0.12] rounded-xl
                        text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#2E8B57]/50"
                    />
                    <span className="text-white/40 text-xs">reps</span>
                  </div>
                </div>
                <button
                  onClick={() => removeRow(idx)}
                  disabled={exercises.length === 1}
                  className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10
                    disabled:opacity-20 disabled:cursor-not-allowed transition-all self-center sm:self-auto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="mt-2 flex items-center gap-1.5 text-sm text-[#61bc84] hover:text-[#2E8B57] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Exercise
          </button>
        </div>

        <div className="flex gap-3 pt-2 border-t border-white/[0.08]">
          <GlassButton
            variant="primary"
            className="flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Workout'}
          </GlassButton>
          <GlassButton onClick={onClose}>Cancel</GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

function TemplatesManager({
  templates,
  onTemplatesChange,
  onClose,
}: {
  templates: WorkoutTemplate[];
  onTemplatesChange: (templates: WorkoutTemplate[]) => void;
  onClose: () => void;
}) {
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null | 'new'>('new' as never);
  const [showForm, setShowForm] = useState(false);
  const [formTemplate, setFormTemplate] = useState<WorkoutTemplate | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleSaved = (saved: WorkoutTemplate) => {
    if (formTemplate) {
      onTemplatesChange(templates.map((t) => (t.id === saved.id ? saved : t)));
    } else {
      onTemplatesChange([...templates, saved]);
    }
    setShowForm(false);
    setFormTemplate(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this workout template? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await deleteWorkoutTemplate(id);
      onTemplatesChange(templates.filter((t) => t.id !== id));
    } catch {}
    setDeleting(null);
  };

  return (
    <>
      <GlassModal isOpen onClose={onClose} title="Manage Workouts" size="lg">
        <div className="space-y-3">
          {templates.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-6">
              No workouts yet. Create your first workout template!
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-3 px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-2xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{t.name}</p>
                    {t.exercises?.length > 0 && (
                      <p className="text-white/40 text-xs mt-0.5">
                        {t.exercises
                          .slice(0, 3)
                          .map((e) => `${e.exercise_name} (${e.default_sets}×${e.default_reps})`)
                          .join(', ')}
                        {t.exercises.length > 3 ? ` +${t.exercises.length - 3} more` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => {
                        setFormTemplate(t);
                        setShowForm(true);
                      }}
                      className="p-1.5 rounded-lg text-white/40 hover:text-[#61bc84] hover:bg-[#2E8B57]/10 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                      className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10
                        disabled:opacity-40 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-white/[0.08]">
            <GlassButton
              variant="primary"
              className="flex-1"
              onClick={() => {
                setFormTemplate(null);
                setShowForm(true);
              }}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Workout
              </span>
            </GlassButton>
            <GlassButton onClick={onClose}>Close</GlassButton>
          </div>
        </div>
      </GlassModal>

      {showForm && (
        <TemplateFormModal
          template={formTemplate}
          onSave={handleSaved}
          onClose={() => {
            setShowForm(false);
            setFormTemplate(null);
          }}
        />
      )}
    </>
  );
}

// ─── Weekly Routine ───────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getPillStyle(workoutName: string): string {
  const name = workoutName.trim();
  if (name === 'Rest') return 'bg-white/5 border-white/10 text-white/40';
  return 'bg-[#2E8B57]/20 border-[#2E8B57]/40 text-[#61bc84]';
}

function WeeklyRoutine({
  templates,
  onOpenTemplateManager,
}: {
  templates: WorkoutTemplate[];
  onOpenTemplateManager: () => void;
}) {
  const [routine, setRoutine] = useState<GymRoutineDay[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTemplateIds, setEditTemplateIds] = useState<Record<number, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const todayDow = new Date().getDay();

  const loadRoutine = useCallback(async () => {
    try {
      const data = await getGymRoutine();
      setRoutine(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadRoutine();
  }, [loadRoutine]);

  const openEditModal = () => {
    const vals: Record<number, number | null> = {};
    routine.forEach((day) => {
      vals[day.day_of_week] = day.template_id ?? null;
    });
    setEditTemplateIds(vals);
    setShowEditModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        DAY_ORDER.map((dow) => {
          const templateId = editTemplateIds[dow] ?? null;
          if (templateId !== null) {
            return updateRoutineDay(dow, { template_id: templateId });
          } else {
            return updateRoutineDay(dow, { template_id: null, workout_name: 'Rest' });
          }
        })
      );
      await loadRoutine();
      setShowEditModal(false);
    } catch {}
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncRoutineToCalendar();
      setToast(`✓ Synced ${result.synced} sessions to your calendar!`);
      setTimeout(() => setToast(null), 3500);
    } catch {
      setToast('Failed to sync — please try again.');
      setTimeout(() => setToast(null), 3000);
    }
    setSyncing(false);
  };

  return (
    <>
      <GlassCard className="mb-4 sm:mb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-white">Weekly Routine</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <GlassButton size="sm" onClick={onOpenTemplateManager} className="flex-1 sm:flex-none text-center">
              <span className="flex items-center justify-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Manage Workouts</span>
                <span className="sm:hidden">Manage</span>
              </span>
            </GlassButton>
            <GlassButton size="sm" onClick={openEditModal} className="flex-1 sm:flex-none text-center">
              Edit
            </GlassButton>
          </div>
        </div>

        {/* Day pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {DAY_ORDER.map((dow) => {
            const day = routine.find((r) => r.day_of_week === dow) || {
              id: null,
              day_of_week: dow,
              workout_name: 'Rest',
              notes: null,
              template_id: null,
              template_name: null,
            };
            const isToday = dow === todayDow;
            const displayName = day.template_name || day.workout_name;
            const pillStyle = getPillStyle(day.workout_name);
            return (
              <div
                key={dow}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border
                  ${pillStyle}
                  ${isToday ? 'ring-2 ring-white/60' : ''}
                  transition-all duration-200 min-w-[56px] sm:min-w-[72px]`}
              >
                <span className="text-xs font-semibold opacity-80">{DAY_LABELS[dow]}</span>
                <span className="text-xs font-medium text-center leading-tight line-clamp-2">
                  {displayName}
                </span>
              </div>
            );
          })}
        </div>

        {/* Sync button */}
        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <GlassButton size="sm" onClick={handleSync} disabled={syncing} className="w-full sm:w-auto">
            <span className="flex items-center justify-center gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5" />
              {syncing ? 'Syncing…' : 'Sync'}
            </span>
          </GlassButton>

          {toast && (
            <span className="text-sm text-[#61bc84] animate-fade-in">{toast}</span>
          )}
        </div>
      </GlassCard>

      {/* Edit Routine Modal */}
      <GlassModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Weekly Routine"
        size="md"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {DAY_ORDER.map((dow, idx) => {
            const selectedTemplateId = editTemplateIds[dow] ?? null;
            const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

            return (
              <div key={dow} className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-white/70 flex-shrink-0">
                    {DAY_NAMES[idx]}
                  </span>
                  <select
                    value={selectedTemplateId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditTemplateIds((prev) => ({
                        ...prev,
                        [dow]: val ? Number(val) : null,
                      }));
                    }}
                    className="flex-1 px-3 py-1.5 bg-white/[0.06] border border-white/[0.12] rounded-xl
                      text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#2E8B57]/50
                      transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="">Rest</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id} className="bg-[#1a1a2e] text-white">
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Exercise summary under selected workout */}
                {selectedTemplate && selectedTemplate.exercises?.length > 0 && (
                  <div className="ml-[6.5rem] text-xs text-white/40 pl-1">
                    {selectedTemplate.exercises
                      .map((e) => `${e.exercise_name} ${e.default_sets}×${e.default_reps}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            );
          })}

          {templates.length === 0 && (
            <p className="text-white/40 text-sm text-center py-4">
              No workouts created yet.{' '}
              <button
                onClick={() => setShowEditModal(false)}
                className="text-[#61bc84] underline"
              >
                Manage Workouts
              </button>{' '}
              to add some.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-white/[0.08] mt-4">
          <GlassButton
            variant="primary"
            className="flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </GlassButton>
          <GlassButton onClick={() => setShowEditModal(false)}>Cancel</GlassButton>
        </div>
      </GlassModal>
    </>
  );
}

// ─── Set Row ─────────────────────────────────────────────────────────────────

function SetRow({
  set,
  onUpdate,
  onDelete,
}: {
  set: GymSet;
  onUpdate: (id: number, data: Partial<GymSet>) => void;
  onDelete: (id: number) => void;
}) {
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(set.weight_kg));

  const handleBlurReps = () => {
    const val = parseInt(reps, 10);
    if (!isNaN(val) && val !== set.reps) {
      onUpdate(set.id, { reps: val });
    }
  };

  const handleBlurWeight = () => {
    const val = parseFloat(weight);
    if (!isNaN(val) && val !== set.weight_kg) {
      onUpdate(set.id, { weight_kg: val });
    }
  };

  return (
    <tr className="group animate-fade-in">
      <td className="py-1.5 pr-3 text-white/50 text-sm w-10">{set.set_number}</td>
      <td className="py-1.5 pr-2">
        <input
          type="number"
          value={reps}
          min={0}
          onChange={(e) => setReps(e.target.value)}
          onBlur={handleBlurReps}
          className="w-16 bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="number"
          value={weight}
          min={0}
          step={0.5}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={handleBlurWeight}
          className="w-20 bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
        />
      </td>
      <td className="py-1.5 w-8">
        <button
          onClick={() => onDelete(set.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all duration-150"
          aria-label="Delete set"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  onUpdateExercise,
  onDeleteExercise,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
}: {
  exercise: GymExercise;
  onUpdateExercise: (id: number, data: Partial<GymExercise>) => void;
  onDeleteExercise: (id: number) => void;
  onAddSet: (exerciseId: number) => void;
  onUpdateSet: (id: number, data: Partial<GymSet>) => void;
  onDeleteSet: (setId: number, exerciseId: number) => void;
}) {
  const [name, setName] = useState(exercise.name);

  const handleNameBlur = () => {
    if (name.trim() && name !== exercise.name) {
      onUpdateExercise(exercise.id, { name: name.trim() });
    }
  };

  const sets = exercise.sets ?? [];

  return (
    <GlassCard className="animate-slide-up">
      {/* Exercise header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <Dumbbell className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          className="flex-1 bg-transparent text-white font-semibold text-base focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 transition-colors"
          placeholder="Exercise name"
        />
        <button
          onClick={() => onDeleteExercise(exercise.id)}
          className="p-1.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all duration-150"
          aria-label="Delete exercise"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Sets table */}
      {sets.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs text-white/40 font-medium pb-2 pr-3">Set</th>
                <th className="text-left text-xs text-white/40 font-medium pb-2 pr-2">Reps</th>
                <th className="text-left text-xs text-white/40 font-medium pb-2 pr-2">kg</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => (
                <SetRow
                  key={set.id}
                  set={set}
                  onUpdate={onUpdateSet}
                  onDelete={(id) => onDeleteSet(id, exercise.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GlassButton size="sm" onClick={() => onAddSet(exercise.id)}>
        <span className="flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Set
        </span>
      </GlassButton>
    </GlassCard>
  );
}

// ─── Session Detail Panel ─────────────────────────────────────────────────────

function SessionDetail({
  session,
  onSessionUpdated,
  onSessionDeleted,
}: {
  session: GymSession;
  onSessionUpdated: (s: GymSession) => void;
  onSessionDeleted: (id: number) => void;
}) {
  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(session.date);
  const [exercises, setExercises] = useState<GymExercise[]>(session.exercises ?? []);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [addingExercise, setAddingExercise] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(session.name);
    setDate(session.date);
    setExercises(session.exercises ?? []);
    setNewExerciseName('');
    setAddingExercise(false);
  }, [session.id]);

  const handleNameBlur = async () => {
    const trimmed = name.trim() || session.name;
    setName(trimmed);
    if (trimmed !== session.name) {
      try {
        const updated = await updateGymSession(session.id, { name: trimmed });
        onSessionUpdated(updated);
      } catch {}
    }
  };

  const handleDateBlur = async () => {
    if (date !== session.date) {
      try {
        const updated = await updateGymSession(session.id, { date });
        onSessionUpdated(updated);
      } catch {}
    }
  };

  const handleAddExercise = async () => {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const ex = await addExercise(session.id, {
        name: trimmed,
        order_index: exercises.length,
      });
      ex.sets = [];
      setExercises((prev) => [...prev, ex]);
      setNewExerciseName('');
      setAddingExercise(false);
    } catch {}
    setSaving(false);
  };

  const handleUpdateExercise = async (id: number, data: Partial<GymExercise>) => {
    try {
      await updateExercise(id, data);
      setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
    } catch {}
  };

  const handleDeleteExercise = async (id: number) => {
    try {
      await deleteExercise(id);
      setExercises((prev) => prev.filter((e) => e.id !== id));
    } catch {}
  };

  const handleAddSet = async (exerciseId: number) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const sets = exercise.sets ?? [];
    const nextSetNumber = sets.length > 0 ? Math.max(...sets.map((s) => s.set_number)) + 1 : 1;
    try {
      const newSet = await addSet(exerciseId, {
        set_number: nextSetNumber,
        reps: 0,
        weight_kg: 0,
      });
      setExercises((prev) =>
        prev.map((e) =>
          e.id === exerciseId ? { ...e, sets: [...(e.sets ?? []), newSet] } : e
        )
      );
    } catch {}
  };

  const handleUpdateSet = async (setId: number, data: Partial<GymSet>) => {
    try {
      await updateSet(setId, data);
      setExercises((prev) =>
        prev.map((e) => ({
          ...e,
          sets: (e.sets ?? []).map((s) => (s.id === setId ? { ...s, ...data } : s)),
        }))
      );
    } catch {}
  };

  const handleDeleteSet = async (setId: number, exerciseId: number) => {
    try {
      await deleteSet(setId);
      setExercises((prev) =>
        prev.map((e) =>
          e.id === exerciseId
            ? { ...e, sets: (e.sets ?? []).filter((s) => s.id !== setId) }
            : e
        )
      );
    } catch {}
  };

  const handleDeleteSession = async () => {
    if (!confirm('Delete this session?')) return;
    try {
      await deleteGymSession(session.id);
      onSessionDeleted(session.id);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <GlassCard>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Session name (e.g. Push Day)"
              className="w-full bg-transparent text-white text-xl font-bold focus:outline-none border-b border-transparent focus:border-white/20 pb-1 transition-colors placeholder-white/30"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onBlur={handleDateBlur}
              className="bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-white/70 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
            />
          </div>
          <GlassButton variant="danger" size="sm" onClick={handleDeleteSession}>
            <Trash2 className="w-3.5 h-3.5" />
          </GlassButton>
        </div>
      </GlassCard>

      {/* Exercises */}
      <div className="space-y-3">
        {exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            onUpdateExercise={handleUpdateExercise}
            onDeleteExercise={handleDeleteExercise}
            onAddSet={handleAddSet}
            onUpdateSet={handleUpdateSet}
            onDeleteSet={handleDeleteSet}
          />
        ))}
      </div>

      {/* Add exercise */}
      {addingExercise ? (
        <GlassCard>
          <div className="flex gap-2">
            <GlassInput
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Exercise name (e.g. Bench Press)"
              className="flex-1"
            />
            <GlassButton
              variant="primary"
              onClick={handleAddExercise}
              disabled={saving || !newExerciseName.trim()}
            >
              Add
            </GlassButton>
            <GlassButton
              onClick={() => {
                setAddingExercise(false);
                setNewExerciseName('');
              }}
            >
              Cancel
            </GlassButton>
          </div>
        </GlassCard>
      ) : (
        <GlassButton onClick={() => setAddingExercise(true)} className="w-full">
          <span className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            Add Exercise
          </span>
        </GlassButton>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GymPage() {
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<GymSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [showTemplatesManager, setShowTemplatesManager] = useState(false);
  const [routine, setRoutine] = useState<GymRoutineDay[]>([]);
  const [startingSession, setStartingSession] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completingSession, setCompletingSession] = useState(false);

  // Set default template when templates load or modal opens
  useEffect(() => {
    if (templates.length > 0 && !newName) {
      setNewName(templates[0].name);
    }
  }, [templates]);

  // Reset newName when modal opens
  useEffect(() => {
    if (showNewModal && templates.length > 0 && !newName) {
      setNewName(templates[0].name);
    }
  }, [showNewModal]);

  const today = todayISO();
  const todayDow = new Date().getDay();

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGymSessions();
      const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
      setSessions(sorted);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    }
    setLoading(false);
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await getWorkoutTemplates();
      setTemplates(data);
    } catch {}
  }, []);

  const loadRoutine = useCallback(async () => {
    try {
      const data = await getGymRoutine();
      setRoutine(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadSessions();
    loadTemplates();
    loadRoutine();
  }, [loadSessions, loadTemplates, loadRoutine]);

  const todaySession = sessions.find((s) => s.date === today && (s.status ?? 'active') === 'active');
  const pastSessions = sessions.filter(
    (s) => s.date !== today || (s.status ?? 'active') !== 'active'
  );

  // Find today's routine entry with template
  const todayRoutine = routine.find((r) => r.day_of_week === todayDow);
  const todayHasTemplate = todayRoutine?.template_id != null;

  const handleCreateSession = async () => {
    setCreating(true);
    try {
      // Find the selected template
      const selectedTemplate = templates.find((t) => t.name === newName);
      
      if (!selectedTemplate) {
        setCreating(false);
        return;
      }
      
      // Create session from template (includes all exercises)
      const session = await startSessionFromTemplate(selectedTemplate.id, newDate);
      
      setSessions((prev) => [session, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setSelectedSession(session);
      setShowNewModal(false);
      setNewName(templates.length > 0 ? templates[0].name : '');
      setNewDate(todayISO());
    } catch (e) {
      console.error('Failed to create session:', e);
    }
    setCreating(false);
  };

  const handleStartFromTemplate = async () => {
    if (!todayRoutine?.template_id) return;
    setStartingSession(true);
    try {
      const session = await startSessionFromTemplate(todayRoutine.template_id, today);
      setSessions((prev) => [session, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setSelectedSession(session);
    } catch (e: unknown) {
      console.error('Failed to start from template', e);
    }
    setStartingSession(false);
  };

  const handleSessionUpdated = (updated: GymSession) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    if (selectedSession?.id === updated.id) {
      setSelectedSession((prev) => (prev ? { ...prev, ...updated } : prev));
    }
  };

  const handleSessionDeleted = (id: number) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (selectedSession?.id === id) setSelectedSession(null);
  };

  const handleSelectSession = async (session: GymSession) => {
    try {
      const full = await apiRequest<GymSession>(`/api/gym/sessions/${session.id}`);
      setSelectedSession(full);
    } catch {
      setSelectedSession(session);
    }
  };

  const handleCompleteWorkout = async () => {
    if (!todaySession) return;
    setCompletingSession(true);
    try {
      const updated = await completeGymSession(todaySession.id);
      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
      );
      if (selectedSession?.id === updated.id) {
        setSelectedSession(null);
      }
      setShowCompleteModal(false);
    } catch (e) {
      console.error('Failed to complete workout:', e);
    }
    setCompletingSession(false);
  };

  return (
    <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Gym</h1>
        <GlassButton variant="primary" onClick={() => setShowNewModal(true)} className="w-full sm:w-auto">
          <span className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Session</span>
          </span>
        </GlassButton>
      </div>

      {/* ── Weekly Routine ── */}
      <WeeklyRoutine
        templates={templates}
        onOpenTemplateManager={() => setShowTemplatesManager(true)}
      />

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* ── Left: Session List ── */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 space-y-3 order-2 lg:order-1">
          {/* Today */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-1">
              Today
            </p>
            {loading ? (
              <div className="skeleton h-20 rounded-3xl" />
            ) : todaySession ? (
              <GlassCard
                onClick={() => handleSelectSession(todaySession)}
                className={selectedSession?.id === todaySession.id ? 'ring-1 ring-indigo-400/50' : ''}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{todaySession.name || 'Workout'}</p>
                    <p className="text-white/50 text-xs mt-0.5">
                      {(todaySession.exercises?.length ?? 0) > 0
                        ? `${todaySession.exercises!.length} exercises`
                        : 'Tap to view'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCompleteModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border border-emerald-300/30
                        bg-emerald-500/15 text-emerald-200 text-xs font-medium backdrop-blur-xl
                        hover:bg-emerald-500/25 hover:border-emerald-200/45 transition-all duration-200"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Complete Workout</span>
                      <span className="sm:hidden">Done</span>
                    </button>
                    <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                  </div>
                </div>
              </GlassCard>
            ) : (
              <GlassCard>
                {todayHasTemplate && todayRoutine ? (
                  <>
                    <div className="mb-3">
                      <p className="text-white font-medium text-sm">
                        {todayRoutine.template_name || todayRoutine.workout_name}
                      </p>
                      {(() => {
                        const tmpl = templates.find((t) => t.id === todayRoutine.template_id);
                        return tmpl?.exercises?.length ? (
                          <p className="text-white/40 text-xs mt-0.5">
                            {tmpl.exercises
                              .slice(0, 3)
                              .map((e) => e.exercise_name)
                              .join(', ')}
                            {tmpl.exercises.length > 3 ? ` +${tmpl.exercises.length - 3} more` : ''}
                          </p>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <GlassButton
                        variant="primary"
                        size="sm"
                        onClick={handleStartFromTemplate}
                        disabled={startingSession}
                      >
                        <span className="flex items-center gap-1.5">
                          <Play className="w-3.5 h-3.5" />
                          {startingSession
                            ? 'Starting…'
                            : `Start ${todayRoutine.template_name || 'Workout'}`}
                        </span>
                      </GlassButton>
                      <GlassButton
                        size="sm"
                        onClick={() => {
                          setNewDate(today);
                          setShowNewModal(true);
                        }}
                      >
                        Empty
                      </GlassButton>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-white/50 text-sm mb-3">No workout logged today.</p>
                    <GlassButton
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setNewDate(today);
                        setShowNewModal(true);
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Start Workout
                      </span>
                    </GlassButton>
                  </>
                )}
              </GlassCard>
            )}
          </div>

          {/* History */}
          {pastSessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-1">
                History
              </p>
              <div className="space-y-2">
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="skeleton h-16 rounded-3xl" />
                    ))
                  : pastSessions.map((session) => (
                      <GlassCard
                        key={session.id}
                        padding={false}
                        onClick={() => handleSelectSession(session)}
                        className={`px-4 py-3 ${
                          selectedSession?.id === session.id ? 'ring-1 ring-indigo-400/50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm font-medium">
                              {session.name || 'Workout'}
                            </p>
                            <p className="text-white/40 text-xs mt-0.5">{formatDate(session.date)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white/30 text-xs">
                              {(session.exercises?.length ?? 0)} ex
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-white/20" />
                          </div>
                        </div>
                      </GlassCard>
                    ))}
              </div>
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <p className="text-white/40 text-sm text-center py-4">
              No sessions yet. Start your first workout!
            </p>
          )}

          {error && <p className="text-red-400 text-sm px-1">{error}</p>}
        </div>

        {/* ── Right: Session Detail ── */}
        <div className="flex-1 min-w-0 order-1 lg:order-2">
          {selectedSession ? (
            <SessionDetail
              key={selectedSession.id}
              session={selectedSession}
              onSessionUpdated={handleSessionUpdated}
              onSessionDeleted={handleSessionDeleted}
            />
          ) : (
            <GlassCard>
              <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <div className="w-16 h-16 rounded-3xl bg-indigo-500/20 flex items-center justify-center">
                  <Dumbbell className="w-8 h-8 text-indigo-300" />
                </div>
                <p className="text-white/50 text-sm max-w-xs">
                  Select a session from the left, or start a new workout to get going.
                </p>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* New Session Modal */}
      <GlassModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Session"
        size="sm"
      >
        <div className="space-y-4">
          <GlassInput
            label="Date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          
          {/* Workout template dropdown */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">
              Select Workout
            </label>
            <div className="relative">
              <select
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl
                  text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40
                  transition-all duration-200 appearance-none cursor-pointer
                  [&>option]:bg-[#1a1a2e] [&>option]:text-white [&>option]:py-2"
              >
                {templates.length === 0 ? (
                  <option value="" className="bg-[#1a1a2e] text-white/50">
                    No workouts available
                  </option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={t.name} className="bg-[#1a1a2e] text-white">
                      {t.name}
                    </option>
                  ))
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-4 h-4 text-white/40 rotate-90" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <GlassButton
              variant="primary"
              className="flex-1"
              onClick={handleCreateSession}
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Create Session'}
            </GlassButton>
            <GlassButton onClick={() => setShowNewModal(false)}>Cancel</GlassButton>
          </div>
        </div>
      </GlassModal>

      {/* Complete Workout Confirm Modal */}
      <GlassModal
        isOpen={showCompleteModal}
        onClose={() => !completingSession && setShowCompleteModal(false)}
        title="Finish this workout?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            This will mark today&apos;s active session as completed and return you to the session list.
          </p>
          <div className="flex gap-3">
            <GlassButton
              variant="primary"
              className="flex-1"
              onClick={handleCompleteWorkout}
              disabled={completingSession}
            >
              {completingSession ? 'Finishing…' : 'Finish Workout'}
            </GlassButton>
            <GlassButton
              onClick={() => setShowCompleteModal(false)}
              disabled={completingSession}
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      </GlassModal>

      {/* Templates Manager */}
      {showTemplatesManager && (
        <TemplatesManager
          templates={templates}
          onTemplatesChange={setTemplates}
          onClose={() => setShowTemplatesManager(false)}
        />
      )}
    </div>
  );
}
