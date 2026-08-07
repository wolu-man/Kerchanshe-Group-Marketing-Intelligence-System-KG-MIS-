'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { LogicRule, Survey, SurveyQuestion, User } from '@/lib/types';

interface Answer {
  questionId: number;
  value: string;
  multiValues: string[];
}

function isApplicable(position: number, questions: SurveyQuestion[], answers: Record<number, Answer>): boolean {
  const question = questions[position - 1];
  if (!question || !question.logicRule) return true;
  const rule = question.logicRule as LogicRule;
  const depQuestion = questions[rule.dependsOnQuestionId - 1];
  if (!depQuestion || !depQuestion.questionId) return true;
  const depAnswer = answers[depQuestion.questionId];
  if (!depAnswer) return false;
  const a = Number(depAnswer.value);
  const b = Number(rule.value);
  const numeric = !Number.isNaN(a) && !Number.isNaN(b);
  switch (rule.operator) {
    case 'eq':
      return numeric ? a === b : depAnswer.value === String(rule.value);
    case 'neq':
      return numeric ? a !== b : depAnswer.value !== String(rule.value);
    case 'gt':
      return numeric && a > b;
    case 'lt':
      return numeric && a < b;
    case 'gte':
      return numeric && a >= b;
    case 'lte':
      return numeric && a <= b;
    default:
      return true;
  }
}

export default function SurveyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [outlets, setOutlets] = useState<Array<{ OutletID: number; OutletName: string }>>([]);
  const [outletId, setOutletId] = useState('');
  const [respondentType, setRespondentType] = useState('');
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [responses, setResponses] = useState<unknown[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'respond' | 'responses'>('respond');
  const [submitting, setSubmitting] = useState(false);

  const loadSurvey = useCallback(() => {
    api
      .get<Survey>(`/api/v1/surveys/${params.id}`)
      .then(setSurvey)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load survey'));
  }, [params.id]);

  useEffect(() => {
    loadSurvey();
    api
      .get<{ user: User }>('/api/v1/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => undefined);
    api.get<Array<{ OutletID: number; OutletName: string }>>('/api/v1/outlets').then(setOutlets).catch(() => undefined);
    if (tab === 'responses') {
      api.get<unknown[]>(`/api/v1/surveys/${params.id}/responses`).then(setResponses).catch(() => setResponses([]));
    }
  }, [params.id, tab, loadSurvey]);

  const applicable = useMemo(() => {
    if (!survey) return [] as number[];
    return survey.questions.map((_, index) => index + 1).filter((pos) => isApplicable(pos, survey.questions, answers));
  }, [survey, answers]);

  function setAnswer(questionId: number, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { questionId, value, multiValues: [] } }));
  }

  function setMultiAnswer(questionId: number, option: string, checked: boolean) {
    setAnswers((prev) => {
      const current = prev[questionId]?.multiValues ?? [];
      const multiValues = checked ? [...current, option] : current.filter((o) => o !== option);
      return { ...prev, [questionId]: { questionId, value: multiValues.join(', '), multiValues } };
    });
  }

  async function publish() {
    setError('');
    try {
      const updated = await api.post<Survey>(`/api/v1/surveys/${params.id}/publish`);
      setSurvey(updated);
      setMessage('Survey published. Field officers have been notified.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    }
  }

  async function clone() {
    setError('');
    try {
      const updated = await api.post<{ SurveyID: number }>(`/api/v1/surveys/${params.id}/clone`);
      router.push(`/surveys/${updated.SurveyID}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone');
    }
  }

  async function submitResponse(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        outletId: outletId ? Number(outletId) : undefined,
        respondentType: respondentType || undefined,
        answers: survey!.questions
          .filter((_, index) => applicable.includes(index + 1) && answers[survey!.questions[index].questionId!])
          .map((q) => ({ questionId: q.questionId!, answerValue: answers[q.questionId!].value })),
      };
      await api.post(`/api/v1/surveys/${params.id}/responses`, payload);
      setMessage('Response submitted.');
      setAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  if (!survey) {
    return (
      <AppShell>
        {error && <div className="alert-box alert-error">{error}</div>}
        <div className="empty">Loading survey...</div>
      </AppShell>
    );
  }

  const canPublish = user?.role === 'Marketing Manager' || user?.role === 'Administrator';
  const canRespond = survey.Status === 'Published';
  const canViewResponses = user?.role === 'Marketing Analyst' || user?.role === 'Marketing Manager' || user?.role === 'Administrator';

  return (
    <AppShell>
      <h1>{survey.Title}</h1>
      <p className="page-sub">
        {survey.BusinessUnit} ·{' '}
        <span className={`badge ${survey.Status === 'Draft' ? 'badge-gray' : survey.Status === 'Published' ? 'badge-green' : 'badge-red'}`}>
          {survey.Status}
        </span>
      </p>

      {error && <div className="alert-box alert-error">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}

      {survey.Status === 'Draft' && (
        <div className="card">
          <h3>Questions</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Question</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {survey.questions.map((q, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{q.questionType}</td>
                  <td>{q.questionText}</td>
                  <td>{q.isRequired ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <Link className="btn btn-sm" href="/surveys">
              Back
            </Link>
            {canPublish && (
              <button className="btn btn-primary btn-sm" onClick={publish}>
                Publish survey
              </button>
            )}
            <button className="btn btn-sm" onClick={clone}>
              Duplicate as template
            </button>
          </div>
        </div>
      )}

      {survey.Status === 'Published' && canRespond && (
        <div className="card">
          <div className="role-list">
            <button className={`btn ${tab === 'respond' ? 'btn-primary' : ''}`} onClick={() => setTab('respond')}>
              Respond
            </button>
            {canViewResponses && (
              <button className={`btn ${tab === 'responses' ? 'btn-primary' : ''}`} onClick={() => setTab('responses')}>
                Responses
              </button>
            )}
          </div>

          {tab === 'respond' && (
            <form onSubmit={submitResponse}>
              <div className="row">
                <div>
                  <label>Outlet</label>
                  <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                    <option value="">Select outlet...</option>
                    {outlets.map((o) => (
                      <option key={o.OutletID} value={o.OutletID}>
                        {o.OutletName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Respondent type</label>
                  <select value={respondentType} onChange={(e) => setRespondentType(e.target.value)}>
                    <option value="">Select...</option>
                    <option value="Retailer">Retailer</option>
                    <option value="Distributor">Distributor</option>
                    <option value="End User">End User</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {survey.questions.map((q, index) => {
                const pos = index + 1;
                if (!applicable.includes(pos)) return null;
                const qid = q.questionId!;
                const answer = answers[qid];
                return (
                  <div key={pos} style={{ marginTop: 14 }}>
                    <label>
                      {pos}. {q.questionText} {q.isRequired && <span style={{ color: 'var(--danger)' }}>*</span>}
                    </label>
                    {q.questionType === 'SingleChoice' && (
                      <div className="role-list">
                        {q.options?.map((opt) => (
                          <label key={opt} style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="radio" name={`q${qid}`} checked={answer?.value === opt} onChange={() => setAnswer(qid, opt)} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                    {q.questionType === 'MultiChoice' && (
                      <div className="role-list">
                        {q.options?.map((opt) => (
                          <label key={opt} style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="checkbox" checked={answer?.multiValues.includes(opt) ?? false} onChange={(e) => setMultiAnswer(qid, opt, e.target.checked)} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                    {q.questionType === 'Text' && <textarea value={answer?.value ?? ''} onChange={(e) => setAnswer(qid, e.target.value)} />}
                    {q.questionType === 'Numeric' && (
                      <input type="number" min={q.minValue} max={q.maxValue} value={answer?.value ?? ''} onChange={(e) => setAnswer(qid, e.target.value)} />
                    )}
                    {q.questionType === 'Rating' && (
                      <select value={answer?.value ?? ''} onChange={(e) => setAnswer(qid, e.target.value)}>
                        <option value="">Select rating...</option>
                        {Array.from({ length: (q.maxValue ?? 10) - (q.minValue ?? 1) + 1 }, (_, i) => (q.minValue ?? 1) + i).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}

              <div className="actions">
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit response'}
                </button>
              </div>
            </form>
          )}

          {tab === 'responses' && (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Respondent</th>
                  <th>Outlet</th>
                  <th>Type</th>
                  <th>Answers</th>
                </tr>
              </thead>
              <tbody>
                {(responses as Array<{ ResponseID: number; RespondentName: string; OutletName: string | null; RespondentType: string | null; AnswerCount: number }>).map((r) => (
                  <tr key={r.ResponseID}>
                    <td>{r.ResponseID}</td>
                    <td>{r.RespondentName}</td>
                    <td>{r.OutletName ?? '—'}</td>
                    <td>{r.RespondentType ?? '—'}</td>
                    <td>{r.AnswerCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {survey.Status === 'Published' && !canRespond && canViewResponses && (
        <div className="card">
          <h3>Responses</h3>
          <button className="btn btn-sm" onClick={() => setTab('responses')}>
            Load responses
          </button>
        </div>
      )}

      {survey.Status === 'Closed' && <div className="empty">This survey is closed.</div>}

      <div className="actions">
        <Link className="btn" href="/surveys">
          Back to surveys
        </Link>
      </div>
    </AppShell>
  );
}
