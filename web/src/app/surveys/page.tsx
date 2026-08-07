'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { Survey } from '@/lib/types';

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-gray',
  Published: 'badge-green',
  Closed: 'badge-red',
};

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Survey[]>('/api/v1/surveys')
      .then(setSurveys)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load surveys'));
  }, []);

  return (
    <AppShell>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Surveys</h1>
          <p className="page-sub">Structured questionnaires and responses.</p>
        </div>
        <Link className="btn btn-primary" href="/surveys/new">
          + New survey
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Business unit</th>
            <th>Questions</th>
            <th>Responses</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {surveys.map((s) => (
            <tr key={s.SurveyID}>
              <td>{s.Title}</td>
              <td>{s.BusinessUnit}</td>
              <td>{s.QuestionCount ?? 0}</td>
              <td>{s.ResponseCount ?? 0}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[s.Status] ?? 'badge-gray'}`}>{s.Status}</span>
              </td>
              <td>
                <Link className="btn btn-sm" href={`/surveys/${s.SurveyID}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {surveys.length === 0 && <div className="empty">No surveys yet.</div>}
    </AppShell>
  );
}
