'use client';

import { useState } from 'react';
import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { CharacterPanel } from './CharacterPanel';
import { CharacterResetPanel } from './CharacterResetPanel';
import { QuestPanel } from './QuestPanel';

interface InfoTabsProps {
  snapshot: GameplayShardSnapshot | null;
}

type InfoTab = 'character' | 'quests';

export function InfoTabs({ snapshot }: InfoTabsProps) {
  const [activeTab, setActiveTab] = useState<InfoTab>('character');

  return (
    <section className="info-tabs" aria-label="Character and quest information">
      <div className="info-tabs__tabs" role="tablist" aria-label="Information tabs">
        <button
          className={`secondary-button ${activeTab === 'character' ? 'secondary-button--active' : ''}`}
          onClick={() => setActiveTab('character')}
          role="tab"
          type="button"
        >
          Full Character
        </button>
        <button
          className={`secondary-button ${activeTab === 'quests' ? 'secondary-button--active' : ''}`}
          onClick={() => setActiveTab('quests')}
          role="tab"
          type="button"
        >
          Quests
        </button>
      </div>
      {activeTab === 'character' ? (
        <div className="info-tabs__panel">
          <CharacterPanel snapshot={snapshot} />
          <CharacterResetPanel snapshot={snapshot} />
        </div>
      ) : (
        <div className="info-tabs__panel">
          <QuestPanel snapshot={snapshot} />
        </div>
      )}
    </section>
  );
}
