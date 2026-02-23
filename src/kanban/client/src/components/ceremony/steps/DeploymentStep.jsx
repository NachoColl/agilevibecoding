import { useCeremonyStore } from '../../../store/ceremonyStore';

const strategies = [
  {
    id: 'local-mvp',
    icon: '💻',
    title: 'Local MVP First',
    subtitle: 'Start on your machine, migrate later',
    bullets: [
      'Zero cloud costs during development',
      'Fast iteration — no deployment delays',
      'SQLite or local PostgreSQL/MongoDB',
      'Docker Compose for production parity',
    ],
    color: 'blue',
  },
  {
    id: 'cloud',
    icon: '☁️',
    title: 'Cloud Deployment',
    subtitle: 'Production-ready from day one',
    bullets: [
      'Managed infrastructure (AWS / Azure / GCP)',
      'Auto-scaling and high availability',
      'Managed databases with backups',
      'CI/CD pipeline recommendations',
      'Monthly cost estimates included',
    ],
    color: 'purple',
  },
];

export function DeploymentStep({ onNext }) {
  const { strategy, setStrategy } = useCeremonyStore();

  const colorMap = {
    blue: {
      border: 'border-blue-500',
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      bullet: 'bg-blue-500',
      btn: 'bg-blue-600 hover:bg-blue-700',
    },
    purple: {
      border: 'border-purple-500',
      bg: 'bg-purple-50',
      icon: 'text-purple-600',
      bullet: 'bg-purple-500',
      btn: 'bg-purple-600 hover:bg-purple-700',
    },
  };

  const handleSelect = (id) => {
    setStrategy(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Deployment Strategy</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose how you want to deploy your project. This shapes architecture and technology recommendations.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {strategies.map((s) => {
          const c = colorMap[s.color];
          const selected = strategy === s.id;
          return (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className={`text-left rounded-xl border-2 p-5 transition-all ${
                selected ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`text-3xl mb-3 ${c.icon}`}>{s.icon}</div>
              <div className="font-semibold text-slate-900 text-base">{s.title}</div>
              <div className="text-xs text-slate-500 mb-3">{s.subtitle}</div>
              <ul className="space-y-1">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.bullet}`} />
                    {b}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onNext}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          Skip — let the model decide
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!strategy}
          className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
