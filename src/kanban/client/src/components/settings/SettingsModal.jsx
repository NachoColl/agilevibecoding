import { useState } from 'react';
import { X } from 'lucide-react';
import { ApiKeysTab } from './ApiKeysTab';
import { CeremonyModelsTab } from './CeremonyModelsTab';
import { ServersTab } from './ServersTab';
import { ModelPricingTab } from './ModelPricingTab';
import { AgentsTab } from './AgentsTab';
import { CostThresholdsTab } from './CostThresholdsTab';

const TABS = [
  { id: 'api-keys',         label: 'API Keys' },
  { id: 'ceremonies',       label: 'Ceremony Models' },
  { id: 'pricing',          label: 'Model Pricing' },
  { id: 'cost-thresholds',  label: 'Cost Limits' },
  { id: 'servers',          label: 'Servers & Ports' },
  { id: 'agents',           label: 'Agents' },
];

export function SettingsModal({ settings, models, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('api-keys');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">⚙ Project Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors ml-4"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 flex-shrink-0 px-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'api-keys' && (
            <ApiKeysTab settings={settings} onSaved={onSaved} />
          )}
          {activeTab === 'ceremonies' && (
            <CeremonyModelsTab settings={settings} models={models} onSaved={onSaved} />
          )}
          {activeTab === 'pricing' && (
            <ModelPricingTab settings={settings} onSaved={onSaved} />
          )}
          {activeTab === 'cost-thresholds' && (
            <CostThresholdsTab settings={settings} onSaved={onSaved} />
          )}
          {activeTab === 'servers' && (
            <ServersTab settings={settings} onSaved={onSaved} />
          )}
          {activeTab === 'agents' && <AgentsTab />}
        </div>
      </div>
    </div>
  );
}
