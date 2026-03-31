'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
import { getTodos, createTodo, updateTodo, deleteTodo } from '@/lib/api';
import type { Todo } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { Trash2, Plus, CheckSquare } from 'lucide-react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'active' | 'completed';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateStr.split('-').map(Number);
  const due = new Date(year, month - 1, day);
  return due < today;
}

function sortTodos(todos: Todo[]): Todo[] {
  const active = todos
    .filter((t) => !t.completed)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  const completed = todos
    .filter((t) => t.completed)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  return [...active, ...completed];
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function TodoSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ─── Due Date Badge ──────────────────────────────────────────────────────────

function DueDateBadge({ date, completed }: { date: string; completed: boolean }) {
  const overdue = !completed && isOverdue(date);
  return (
    <span
      className={clsx(
        'text-xs px-2 py-0.5 rounded-full border font-medium shrink-0',
        overdue
          ? 'bg-red-500/15 border-red-400/30 text-red-300'
          : 'bg-white/10 border-white/20 text-white/50'
      )}
    >
      {overdue ? '⚠ Overdue · ' : ''}{formatDueDate(date)}
    </span>
  );
}

// ─── Inline Editable Title ────────────────────────────────────────────────────

function InlineTitle({
  todo,
  onSave,
}: {
  todo: Todo;
  onSave: (id: number, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(todo.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleBlur() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== todo.title) {
      onSave(todo.id, trimmed);
    } else {
      setValue(todo.title);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') inputRef.current?.blur();
    if (e.key === 'Escape') {
      setValue(todo.title);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={clsx(
          'flex-1 bg-transparent border-b border-indigo-400/60 text-white',
          'focus:outline-none text-sm font-medium pb-0.5 min-w-0'
        )}
      />
    );
  }

  return (
    <span
      onClick={() => !todo.completed && setEditing(true)}
      className={clsx(
        'flex-1 text-sm font-medium min-w-0 break-words',
        todo.completed
          ? 'line-through text-white/40 cursor-default'
          : 'text-white cursor-pointer hover:text-indigo-300 transition-colors'
      )}
      title={todo.completed ? undefined : 'Click to edit'}
    >
      {todo.title}
    </span>
  );
}

// ─── Custom Glass Checkbox ────────────────────────────────────────────────────

function GlassCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={clsx(
        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200',
        checked
          ? 'bg-indigo-500 border-indigo-400 shadow-lg shadow-indigo-500/30'
          : 'bg-white/10 border-white/30 hover:border-indigo-400/60'
      )}
      aria-checked={checked}
      role="checkbox"
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({
  todo,
  onToggle,
  onDelete,
  onEditTitle,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onEditTitle: (id: number, title: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <GlassCard
      padding={false}
      className={clsx(
        'px-4 py-3 transition-opacity duration-200',
        todo.completed && 'opacity-50'
      )}
    >
      <div
        className="flex items-center gap-3"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <GlassCheckbox
          checked={todo.completed}
          onChange={() => onToggle(todo.id, !todo.completed)}
        />

        <InlineTitle todo={todo} onSave={onEditTitle} />

        {todo.due_date && (
          <DueDateBadge date={todo.due_date} completed={todo.completed} />
        )}

        <button
          type="button"
          onClick={() => onDelete(todo.id)}
          className={clsx(
            'p-1.5 rounded-xl text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 shrink-0',
            hovered ? 'opacity-100' : 'opacity-0'
          )}
          aria-label="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </GlassCard>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: Filter }) {
  const messages: Record<Filter, { emoji: string; title: string; sub: string }> = {
    all: {
      emoji: '✅',
      title: 'No tasks yet',
      sub: 'Add your first task to get started.',
    },
    active: {
      emoji: '🎉',
      title: 'All caught up!',
      sub: 'No active tasks — enjoy the peace.',
    },
    completed: {
      emoji: '📭',
      title: 'Nothing completed yet',
      sub: 'Finish a task and it will show up here.',
    },
  };

  const { emoji, title, sub } = messages[filter];

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="text-white font-semibold text-lg">{title}</p>
      <p className="text-white/50 text-sm">{sub}</p>
    </div>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────

function AddTaskModal({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (title: string, dueDate: string | null) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  function handleClose() {
    setTitle('');
    setDueDate('');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onAdd(title.trim(), dueDate || null);
      handleClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={handleClose} title="Add Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <GlassInput
          label="Title"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <GlassInput
          label="Due Date (optional)"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <div className="flex gap-3 pt-1">
          <GlassButton type="button" onClick={handleClose} className="flex-1">
            Cancel
          </GlassButton>
          <GlassButton
            type="submit"
            variant="primary"
            disabled={!title.trim() || loading}
            className="flex-1"
          >
            {loading ? 'Adding…' : 'Add Task'}
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
];

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [modalOpen, setModalOpen] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchTodos = useCallback(() => {
    setLoading(true);
    getTodos()
      .then((data) => setTodos(sortTodos(data)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  useSocketEvent('todo-created', fetchTodos);
  useSocketEvent('todo-updated', fetchTodos);
  useSocketEvent('todo-deleted', fetchTodos);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleAdd(title: string, due_date: string | null) {
    const created = await createTodo({ title, due_date });
    setTodos((prev) => sortTodos([...prev, created]));
  }

  async function handleToggle(id: number, completed: boolean) {
    const updated = await updateTodo(id, { completed });
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === id ? updated : t))));
  }

  async function handleDelete(id: number) {
    await deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleEditTitle(id: number, title: string) {
    const updated = await updateTodo(id, { title });
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === id ? updated : t))));
  }

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = todos.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">To-Do</h1>
        <GlassButton
          variant="primary"
          onClick={() => setModalOpen(true)}
        >
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add Task
          </span>
        </GlassButton>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 p-1 backdrop-blur-sm bg-white/[0.05] border border-white/10 rounded-2xl w-fit">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={clsx(
              'px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 select-none',
              filter === value
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                : 'text-white/50 hover:text-white'
            )}
          >
            {label}
            {(() => {
              if (value === 'all') return null;
              const count =
                value === 'active'
                  ? todos.filter((t) => !t.completed).length
                  : todos.filter((t) => t.completed).length;
              return count > 0 ? (
                <span className="ml-1.5 text-xs opacity-70">{count}</span>
              ) : null;
            })()}
          </button>
        ))}
      </div>

      {/* Task List */}
      {loading ? (
        <TodoSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-2 animate-slide-up">
          {filtered.map((todo) => (
            <TaskRow
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEditTitle={handleEditTitle}
            />
          ))}
        </div>
      )}

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAdd}
      />
    </div>
  );
}
