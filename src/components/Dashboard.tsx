"use client";

import { useEffect, useState } from "react";
import { supabase, Routine, RoutineLog, Todo, Expense } from "@/lib/supabase";

function todayStr() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function monthStr(dateStr: string) {
  return dateStr.slice(0, 7);
}

const CATEGORY_OPTIONS = ["식비", "생필품", "교통", "문화/여가", "기타"];

export default function Dashboard() {
  const [today, setToday] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [newRoutineName, setNewRoutineName] = useState("");
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newExpenseTitle, setNewExpenseTitle] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState(CATEGORY_OPTIONS[0]);

  useEffect(() => {
    const t = todayStr();
    setToday(t);
    loadAll(t);
  }, []);

  async function loadAll(forDate: string) {
    setLoading(true);
    const [routinesRes, logsRes, todosRes, expensesRes] = await Promise.all([
      supabase.from("routines").select("*").order("sort_order", { ascending: true }),
      supabase.from("routine_logs").select("*").eq("log_date", forDate),
      supabase.from("todos").select("*").order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").order("spent_date", { ascending: false }),
    ]);

    if (routinesRes.data) setRoutines(routinesRes.data as Routine[]);
    if (logsRes.data) setLogs(logsRes.data as RoutineLog[]);
    if (todosRes.data) setTodos(todosRes.data as Todo[]);
    if (expensesRes.data) setExpenses(expensesRes.data as Expense[]);
    setLoading(false);
  }

  // ---------- Routines ----------
  async function addRoutine() {
    const name = newRoutineName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("routines")
      .insert({ name, sort_order: routines.length })
      .select()
      .single();
    if (!error && data) {
      setRoutines((prev) => [...prev, data as Routine]);
      setNewRoutineName("");
    }
  }

  async function toggleRoutine(routineId: string) {
    const existing = logs.find((l) => l.routine_id === routineId);
    if (existing) {
      const { data, error } = await supabase
        .from("routine_logs")
        .update({ done: !existing.done })
        .eq("id", existing.id)
        .select()
        .single();
      if (!error && data) {
        setLogs((prev) =>
          prev.map((l) => (l.id === existing.id ? (data as RoutineLog) : l))
        );
      }
    } else {
      const { data, error } = await supabase
        .from("routine_logs")
        .insert({ routine_id: routineId, log_date: today ?? todayStr(), done: true })
        .select()
        .single();
      if (!error && data) {
        setLogs((prev) => [...prev, data as RoutineLog]);
      }
    }
  }

  async function deleteRoutine(id: string) {
    await supabase.from("routines").delete().eq("id", id);
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    setLogs((prev) => prev.filter((l) => l.routine_id !== id));
  }

  // ---------- Todos ----------
  async function addTodo() {
    const title = newTodoTitle.trim();
    if (!title) return;
    const { data, error } = await supabase
      .from("todos")
      .insert({ title })
      .select()
      .single();
    if (!error && data) {
      setTodos((prev) => [data as Todo, ...prev]);
      setNewTodoTitle("");
    }
  }

  async function toggleTodo(todo: Todo) {
    const { data, error } = await supabase
      .from("todos")
      .update({ done: !todo.done })
      .eq("id", todo.id)
      .select()
      .single();
    if (!error && data) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? (data as Todo) : t)));
    }
  }

  async function deleteTodo(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  // ---------- Expenses ----------
  async function addExpense() {
    const title = newExpenseTitle.trim();
    const amount = Number(newExpenseAmount);
    if (!title || !amount || amount <= 0) return;
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        title,
        amount,
        category: newExpenseCategory,
        spent_date: today ?? todayStr(),
      })
      .select()
      .single();
    if (!error && data) {
      setExpenses((prev) => [data as Expense, ...prev]);
      setNewExpenseTitle("");
      setNewExpenseAmount("");
    }
  }

  async function deleteExpense(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading || !today) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-400">
        불러오는 중...
      </div>
    );
  }

  const doneRoutineIds = new Set(
    logs.filter((l) => l.done).map((l) => l.routine_id)
  );
  const routineProgress =
    routines.length === 0
      ? 0
      : Math.round((doneRoutineIds.size / routines.length) * 100);

  const pendingTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);

  const thisMonth = monthStr(today);
  const monthExpenses = expenses.filter((e) => monthStr(e.spent_date) === thisMonth);
  const monthTotal = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const categoryTotals = CATEGORY_OPTIONS.map((cat) => ({
    category: cat,
    total: monthExpenses
      .filter((e) => e.category === cat)
      .reduce((sum, e) => sum + Number(e.amount), 0),
  })).filter((c) => c.total > 0);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">하루 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {today} · 루틴, 할 일, 지출을 한눈에
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Routines */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">오늘의 루틴</h2>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {doneRoutineIds.size}/{routines.length}
            </span>
          </div>

          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${routineProgress}%` }}
            />
          </div>

          <ul className="space-y-2">
            {routines.map((r) => {
              const done = doneRoutineIds.has(r.id);
              return (
                <li
                  key={r.id}
                  className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-50"
                >
                  <button
                    onClick={() => toggleRoutine(r.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-neutral-300 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={done ? "text-neutral-400 line-through" : ""}>
                      {r.name}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteRoutine(r.id)}
                    className="invisible text-xs text-neutral-300 hover:text-red-400 group-hover:visible"
                  >
                    삭제
                  </button>
                </li>
              );
            })}
            {routines.length === 0 && (
              <li className="py-6 text-center text-sm text-neutral-400">
                아직 등록한 루틴이 없어요
              </li>
            )}
          </ul>

          <div className="mt-4 flex gap-2">
            <input
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRoutine()}
              placeholder="루틴 추가 (예: 물 2L 마시기)"
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <button
              onClick={addRoutine}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              추가
            </button>
          </div>
        </section>

        {/* Todos */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">할 일</h2>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {pendingTodos.length}개 남음
            </span>
          </div>

          <ul className="space-y-2">
            {pendingTodos.map((t) => (
              <li
                key={t.id}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-50"
              >
                <button
                  onClick={() => toggleTodo(t)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="h-5 w-5 shrink-0 rounded-full border border-neutral-300" />
                  <span>{t.title}</span>
                </button>
                <button
                  onClick={() => deleteTodo(t.id)}
                  className="invisible text-xs text-neutral-300 hover:text-red-400 group-hover:visible"
                >
                  삭제
                </button>
              </li>
            ))}

            {doneTodos.length > 0 && (
              <li className="pt-2 text-xs font-medium text-neutral-400">
                완료됨
              </li>
            )}
            {doneTodos.map((t) => (
              <li
                key={t.id}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-50"
              >
                <button
                  onClick={() => toggleTodo(t)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-[10px] text-white">
                    ✓
                  </span>
                  <span className="text-neutral-400 line-through">{t.title}</span>
                </button>
                <button
                  onClick={() => deleteTodo(t.id)}
                  className="invisible text-xs text-neutral-300 hover:text-red-400 group-hover:visible"
                >
                  삭제
                </button>
              </li>
            ))}

            {todos.length === 0 && (
              <li className="py-6 text-center text-sm text-neutral-400">
                할 일을 추가해보세요
              </li>
            )}
          </ul>

          <div className="mt-4 flex gap-2">
            <input
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTodo()}
              placeholder="할 일 추가"
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <button
              onClick={addTodo}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              추가
            </button>
          </div>
        </section>

        {/* Expenses */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">이번 달 지출</h2>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {monthTotal.toLocaleString()}원
            </span>
          </div>

          {categoryTotals.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {categoryTotals.map((c) => (
                <div key={c.category} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-neutral-500">{c.category}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-neutral-900"
                      style={{
                        width: `${Math.min(
                          100,
                          (c.total / Math.max(monthTotal, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-neutral-500">
                    {c.total.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          )}

          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {expenses.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-50"
              >
                <div>
                  <p className="text-sm">{e.title}</p>
                  <p className="text-xs text-neutral-400">
                    {e.spent_date} · {e.category}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {Number(e.amount).toLocaleString()}원
                  </span>
                  <button
                    onClick={() => deleteExpense(e.id)}
                    className="invisible text-xs text-neutral-300 hover:text-red-400 group-hover:visible"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
            {expenses.length === 0 && (
              <li className="py-6 text-center text-sm text-neutral-400">
                지출 내역이 없어요
              </li>
            )}
          </ul>

          <div className="mt-4 space-y-2">
            <div className="flex gap-2">
              <input
                value={newExpenseTitle}
                onChange={(e) => setNewExpenseTitle(e.target.value)}
                placeholder="지출 내용 (예: 점심)"
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
              <input
                value={newExpenseAmount}
                onChange={(e) => setNewExpenseAmount(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && addExpense()}
                placeholder="금액"
                inputMode="numeric"
                className="w-24 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={newExpenseCategory}
                onChange={(e) => setNewExpenseCategory(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                onClick={addExpense}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                추가
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
