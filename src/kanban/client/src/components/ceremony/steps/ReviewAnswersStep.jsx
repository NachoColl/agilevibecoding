import { useCeremonyStore } from '../../../store/ceremonyStore';

const FIELDS = [
  {
    key: 'TARGET_USERS',
    label: 'Target Users',
    description: 'Who will use this application? List different user types and their roles.',
    rows: 3,
    required: true,
  },
  {
    key: 'DEPLOYMENT_TARGET',
    label: 'Deployment Target',
    description: 'Where and how will this application be deployed?',
    rows: 3,
    required: true,
  },
  {
    key: 'TECHNICAL_CONSIDERATIONS',
    label: 'Technical Considerations',
    description: 'Technology stack, architectural patterns, scalability, and performance requirements.',
    rows: 4,
    required: true,
  },
  {
    key: 'TECHNICAL_EXCLUSIONS',
    label: 'Technical Exclusions',
    description:
      'Technologies, frameworks, or services to explicitly exclude from recommendations. Leave blank if none.',
    rows: 2,
    required: false,
  },
  {
    key: 'SECURITY_AND_COMPLIANCE_REQUIREMENTS',
    label: 'Security & Compliance Requirements',
    description:
      'Security, privacy, or regulatory requirements your application must meet. Examples: GDPR compliance, PCI DSS, two-factor authentication.',
    rows: 3,
    required: true,
  },
];

export function ReviewAnswersStep({ onNext, onBack }) {
  const { answers, updateAnswer } = useCeremonyStore();

  const canContinue = FIELDS.filter((f) => f.required).every(
    (f) => answers[f.key]?.trim()
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Review & Edit Answers</h2>
        <p className="text-sm text-slate-500 mt-1">
          AI has pre-filled these answers based on your selections. Review and edit as needed.
        </p>
      </div>

      <div className="space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <p className="text-xs text-slate-400 mb-1">{field.description}</p>
            <textarea
              value={answers[field.key] || ''}
              onChange={(e) => updateAnswer(field.key, e.target.value)}
              rows={field.rows}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder={field.required ? `Required...` : 'Optional...'}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!canContinue}
          className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-green-700 transition-colors"
        >
          Generate Project Documentation
        </button>
      </div>
    </div>
  );
}
