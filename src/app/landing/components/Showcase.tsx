import { ArrowUpRight, Sparkles, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { useLang } from "../i18n/LanguageContext";

const visuals: ReactNode[] = [];
const reversed = [false, true, false, true, false];

function TasksVisual() {
  const tasks = [
    { title: "Замер у Алии Б.", tag: "Сегодня", who: "АК", done: false, prio: "high" },
    { title: "Согласовать чертёж кухни №418", tag: "Завтра", who: "МС", done: false, prio: "med" },
    { title: "Заказать петли Blum", tag: "Вт, 14:00", who: "ДЖ", done: true, prio: "low" },
    { title: "Доставка шкафа №401", tag: "Ср, 10:00", who: "АК", done: false, prio: "med" },
  ];
  const prioColor: Record<string, string> = {
    high: "bg-rose-500",
    med: "bg-amber-500",
    low: "bg-slate-300",
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-slate-500">Мои задачи</span>
        <span className="text-[#58c084]">3 в работе</span>
      </div>
      <div className="space-y-2.5">
        {tasks.map((t) => (
          <div
            key={t.title}
            className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"
          >
            <span
              className={`h-4 w-4 rounded-md flex-shrink-0 flex items-center justify-center ${
                t.done ? "bg-[#58c084]" : "border border-slate-300"
              }`}
            >
              {t.done && (
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className={`h-1.5 w-1.5 rounded-full ${prioColor[t.prio]}`} />
            <span className={`flex-1 text-sm ${t.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
              {t.title}
            </span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">{t.tag}</span>
            <span className="h-7 w-7 rounded-full bg-emerald-50 text-[#58c084] text-[10px] flex items-center justify-center">
              {t.who}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIDesignVisual() {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-slate-500 inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#58c084]" />
          AI-дизайнер
        </span>
        <span className="text-slate-400">Beta</span>
      </div>

      <div className="rounded-xl border border-slate-100 p-3 bg-slate-50/50">
        <div className="text-[11px] text-slate-500 mb-1.5">Запрос клиента</div>
        <div className="text-sm text-slate-700">
          «Кухня в скандинавском стиле, белый дуб, остров с барной стойкой, 12 м²»
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`relative aspect-square rounded-xl overflow-hidden ${
              i === 1 ? "ring-2 ring-[#58c084]" : "border border-slate-100"
            }`}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <rect width="100" height="100" fill={i === 0 ? "#f1f5f9" : i === 1 ? "#ecfdf5" : "#f8fafc"} />
              <rect x="10" y="55" width="35" height="30" fill="#fff" stroke="#cbd5e1" />
              <rect x="50" y="50" width="40" height="35" fill="#fff" stroke="#cbd5e1" />
              <rect x="55" y="40" width="30" height="10" fill="#58c084" opacity="0.4" />
              <line x1="0" y1="55" x2="100" y2="55" stroke="#cbd5e1" strokeWidth="0.5" />
              <circle cx="25" cy="68" r="2" fill="#94a3b8" />
              <circle cx="70" cy="65" r="2" fill="#94a3b8" />
            </svg>
            {i === 1 && (
              <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[#58c084] flex items-center justify-center">
                <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none">
                  <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-900 text-white px-4 py-3">
        <div>
          <div className="text-[10px] text-slate-400">Предварительная смета</div>
          <div className="tracking-tight">1 240 000 ₸</div>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-full bg-[#58c084] px-3.5 py-2 text-xs">
          <Wand2 className="h-3 w-3" />
          Сгенерировать ещё
        </button>
      </div>
    </div>
  );
}

export function Showcase() {
  const { t } = useLang();
  const visualNodes = [
    <WarehouseVisual />,
    <KanbanVisual />,
    <TasksVisual />,
    <AIDesignVisual />,
    <AnalyticsVisual />,
  ];
  return (
    <section id="interface" className="py-24 sm:py-32 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="max-w-2xl mb-20">
          <p className="text-sm text-[#58c084]">{t.showcase.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.showcase.title}
          </h2>
        </div>

        <div className="space-y-24 sm:space-y-32">
          {t.showcase.items.map((item: any, index: number) => (
            <div
              key={index}
              className={`grid lg:grid-cols-2 items-center gap-12 lg:gap-20 ${
                reversed[index] ? "lg:[&>div:first-child]:order-2" : ""
              }`}
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">{item.eyebrow}</p>
                <h3 className="mt-3 text-slate-900 text-2xl sm:text-3xl tracking-tight leading-tight">{item.title}</h3>
                <p className="mt-5 text-slate-600 leading-relaxed">{item.description}</p>
                <ul className="mt-8 space-y-3">
                  {item.points.map((point: string) => (
                    <li key={point} className="flex items-center gap-3 text-slate-700 text-sm py-2 border-b border-slate-200/70 last:border-b-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#58c084]" />
                      {point}
                    </li>
                  ))}
                </ul>
                <a
                  href="#/signup"
                  className="mt-8 inline-flex items-center gap-1.5 text-sm text-slate-900 hover:text-[#58c084] transition-colors"
                >
                  {t.showcase.more}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200/60 p-5 sm:p-8 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.12)]">
                {visualNodes[index]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WarehouseVisual() {
  const items = [
    { name: "ЛДСП Egger 18мм", qty: 124, max: 200, unit: "лист", color: "#58c084" },
    { name: "Кромка ПВХ белая", qty: 38, max: 100, unit: "м", color: "#58c084" },
    { name: "Петли Blum", qty: 12, max: 80, unit: "шт", color: "#f59e0b" },
    { name: "Направляющие 450мм", qty: 156, max: 200, unit: "пара", color: "#58c084" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Остатки на складе</span>
        <span className="text-[#58c084]">Обновлено сейчас</span>
      </div>
      {items.map((it) => {
        const pct = Math.round((it.qty / it.max) * 100);
        return (
          <div key={it.name} className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{it.name}</span>
              <span className="text-slate-900 tracking-tight">
                {it.qty} <span className="text-slate-400 text-xs">{it.unit}</span>
              </span>
            </div>
            <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: it.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanVisual() {
  const cols = [
    { title: "Распил", color: "bg-slate-100 text-slate-600", cards: ["Кухня №412", "Шкаф №418"] },
    { title: "Кромка", color: "bg-amber-100 text-amber-700", cards: ["Стол №407"] },
    { title: "Сборка", color: "bg-emerald-100 text-[#58c084]", cards: ["Гардероб №401", "Тумба №404", "Комод №396"] },
  ];
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-slate-500">Этапы производства</span>
        <span className="text-slate-400">Сегодня · 6 заказов</span>
      </div>
      <div className="flex flex-col sm:grid sm:grid-cols-3 gap-3">
        {cols.map((col) => (
          <div key={col.title} className="rounded-xl bg-slate-50 p-3 min-h-[160px] sm:min-h-[200px]">
            <div className={`inline-flex px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider ${col.color}`}>
              {col.title}
            </div>
            <div className="mt-3 space-y-2">
              {col.cards.map((c) => (
                <div key={c} className="rounded-lg bg-white border border-slate-100 px-3 py-2.5">
                  <div className="text-xs text-slate-700">{c}</div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-[#58c084]" />
                    <span className="text-[10px] text-slate-400">в работе</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsVisual() {
  const bars = [40, 65, 50, 78, 60, 88, 72];
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-500">Выручка по неделям</span>
        <span className="text-[#58c084]">+24,5%</span>
      </div>
      <div className="tracking-tight text-2xl text-slate-900">8,7 млн ₸</div>

      <div className="mt-6 flex items-end gap-2.5 h-36">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={`w-full rounded-md ${
                i === bars.length - 1 ? "bg-[#58c084]" : "bg-emerald-100"
              }`}
              style={{ height: `${h}%` }}
            />
            <span className="text-[10px] text-slate-400">Н{i + 1}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniMetric label="Конверсия" value="32%" trend="+4%" />
        <MiniMetric label="Загрузка цеха" value="87%" trend="+12%" />
        <MiniMetric label="Маржа" value="41%" trend="+6%" />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="mt-1 tracking-tight text-slate-900">{value}</div>
      <div className="text-[10px] text-[#58c084]">{trend}</div>
    </div>
  );
}
