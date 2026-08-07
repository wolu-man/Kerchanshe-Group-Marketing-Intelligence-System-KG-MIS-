'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { LogicRule, QuestionType, SurveyQuestion } from '@/lib/types';

const QUESTION_TYPES: QuestionType[] = ['SingleChoice', 'MultiChoice', 'Text', 'Numeric', 'Rating'];

function emptyQuestion(): SurveyQuestion {
  return {
    questionType: 'SingleChoice',
    questionText: '',
    options: ['', ''],
    logicRule: null,
    isRequired: true,
    minValue: undefined,
    maxValue: undefined,
    sortOrder: 0,
  };
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([emptyQuestion()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateQuestion(index: number, patch: Partial<SurveyQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(index: number, optIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const options = [...(q.options ?? [])];
        options[optIndex] = value;
        return { ...q, options };
      }),
    );
  }

  function addOption(index: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, options: [...(q.options ?? []), ''] } : q)),
    );
  }

  function removeOption(index: number, optIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, options: (q.options ?? []).filter((_, oi) => oi !== optIndex) } : q)),
    );
  }

  function onLogicChange(index: number, field: keyof LogicRule, value: string | number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const current: LogicRule | null = q.logicRule ?? {
          dependsOnQuestionId: 0,
          operator: 'eq',
          value: '',
        };
        return { ...q, logicRule: { ...current, [field]: value } };
      }),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const cleaned = questions.map((q, i) => ({
      questionType: q.questionType,
      questionText: q.questionText,
      options: q.questionType === 'SingleChoice' || q.questionType === 'MultiChoice' ? (q.options ?? []).filter((o) => o.trim()) : undefined,
      logicRule: q.logicRule?.dependsOnQuestionId ? { ...q.logicRule, dependsOnQuestionId: Number(q.logicRule.dependsOnQuestionId) } : null,
      isRequired: q.isRequired ?? true,
      minValue: q.minValue,
      maxValue: q.maxValue,
      sortOrder: i,
    }));
    try {
      const survey = await api.post<{ SurveyID: number }>('/api/v1/surveys', {
        title,
        businessUnit,
        questions: cleaned,
      });
      router.push(`/surveys/${survey.SurveyID}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create survey');
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <h1>New Survey</h1>
      <p className="page-sub">Build a structured questionnaire.</p>

      {error && <div className="alert-box alert-error">{error}</div>}

      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="row">
            <div>
              <label>Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label>Business unit</label>
              <input type="text" value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} placeholder="e.g. Coffee, Tea" required />
            </div>
          </div>

          {questions.map((q, index) => (
            <div key={index} className="card" style={{ border: '1px dashed var(--border)' }}>
              <div className="row">
                <div>
                  <label>Question {index + 1} type</label>
                  <select value={q.questionType} onChange={(e) => updateQuestion(index, { questionType: e.target.value as QuestionType })}>
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Required</label>
                  <select value={q.isRequired ? 'true' : 'false'} onChange={(e) => updateQuestion(index, { isRequired: e.target.value === 'true' })}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>

              <label>Question text</label>
              <input
                type="text"
                value={q.questionText}
                onChange={(e) => updateQuestion(index, { questionText: e.target.value })}
                required
              />

              {(q.questionType === 'SingleChoice' || q.questionType === 'MultiChoice') && (
                <>
                  <label>Options</label>
                  {(q.options ?? []).map((opt, optIndex) => (
                    <div key={optIndex} className="row" style={{ marginBottom: 6 }}>
                      <input type="text" value={opt} onChange={(e) => updateOption(index, optIndex, e.target.value)} placeholder={`Option ${optIndex + 1}`} />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeOption(index, optIndex)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm" onClick={() => addOption(index)}>
                    + Add option
                  </button>
                </>
              )}

              {(q.questionType === 'Numeric' || q.questionType === 'Rating') && (
                <div className="row">
                  <div>
                    <label>Min value</label>
                    <input type="number" value={q.minValue ?? ''} onChange={(e) => updateQuestion(index, { minValue: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <div>
                    <label>Max value</label>
                    <input type="number" value={q.maxValue ?? ''} onChange={(e) => updateQuestion(index, { maxValue: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </div>
              )}

              <div className="card" style={{ background: '#f8fafc', border: 'none' }}>
                <label>Conditional (skip) logic — show this question only when...</label>
                <div className="row">
                  <div>
                    <label>Depends on question</label>
                    <select
                      value={q.logicRule?.dependsOnQuestionId ?? 0}
                      onChange={(e) => onLogicChange(index, 'dependsOnQuestionId', e.target.value)}
                    >
                      <option value={0}>None (always show)</option>
                      {questions.map((other, oi) =>
                        oi !== index && other.questionText ? (
                          <option key={oi} value={oi + 1}>
                            Q{oi + 1}: {other.questionText.slice(0, 40)}
                          </option>
                        ) : null,
                      )}
                    </select>
                  </div>
                  <div>
                    <label>Operator</label>
                    <select value={q.logicRule?.operator ?? 'eq'} onChange={(e) => onLogicChange(index, 'operator', e.target.value)}>
                      <option value="eq">equals</option>
                      <option value="neq">not equals</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="gte">&gt;=</option>
                      <option value="lte">&lt;=</option>
                    </select>
                  </div>
                  <div>
                    <label>Value</label>
                    <input type="text" value={q.logicRule?.value ?? ''} onChange={(e) => onLogicChange(index, 'value', e.target.value)} />
                  </div>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Note: dependency uses the question order (Q1 = first question).
                </div>
              </div>

              <div className="actions">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove question
                </button>
              </div>
            </div>
          ))}

          <div className="actions">
            <button type="button" className="btn" onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}>
              + Add question
            </button>
          </div>

          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create survey (Draft)'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
