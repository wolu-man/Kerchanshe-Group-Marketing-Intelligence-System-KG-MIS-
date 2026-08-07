import sql from 'mssql';
import { getPool } from '../../db/pool';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

export type QuestionType = 'SingleChoice' | 'MultiChoice' | 'Text' | 'Numeric' | 'Rating';

export interface QuestionInput {
  questionType: QuestionType;
  questionText: string;
  options?: string[];
  logicRule?: LogicRule | null;
  isRequired?: boolean;
  minValue?: number;
  maxValue?: number;
  sortOrder?: number;
}

export interface LogicRule {
  dependsOnQuestionId: number;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number;
}

export interface SurveyInput {
  title: string;
  businessUnit: string;
  questions: QuestionInput[];
}

export interface AnswerInput {
  questionId: number;
  answerValue: string;
}

export interface ResponseInput {
  surveyId: number;
  outletId?: number;
  respondentType?: string;
  answers: AnswerInput[];
}

export const VALID_QUESTION_TYPES: QuestionType[] = ['SingleChoice', 'MultiChoice', 'Text', 'Numeric', 'Rating'];
export const VALID_STATUSES = ['Draft', 'Published', 'Closed'];

export interface SurveyQuestionRow {
  QuestionID: number;
  LogicRuleJSON: string | null;
}

export interface SurveyQuestionRowItem {
  questionId: number;
  questionType: QuestionType;
  questionText: string;
  isRequired: boolean;
  minValue?: number;
  maxValue?: number;
  logicRule?: LogicRule | null;
}

/**
 * Evaluates whether a question's skip/conditional logic makes it applicable.
 * `dependsOnQuestionId` in the rule refers to the 1-based position of the
 * dependency within the survey question list (matching the builder UI).
 */
export function isQuestionApplicable(
  position: number,
  questions: SurveyQuestionRow[],
  answers: Map<number, string>,
): boolean {
  const question = questions[position - 1];
  if (!question || !question.LogicRuleJSON) return true;
  let rule: LogicRule;
  try {
    rule = JSON.parse(question.LogicRuleJSON) as LogicRule;
  } catch {
    return true;
  }
  const dependsQuestion = questions[rule.dependsOnQuestionId - 1];
  if (!dependsQuestion) return false;
  const dependsAnswer = answers.get(dependsQuestion.QuestionID);
  if (dependsAnswer === undefined) return false;

  const a = Number(dependsAnswer);
  const b = Number(rule.value);
  const numeric = !Number.isNaN(a) && !Number.isNaN(b);

  switch (rule.operator) {
    case 'eq':
      return numeric ? a === b : dependsAnswer === String(rule.value);
    case 'neq':
      return numeric ? a !== b : dependsAnswer !== String(rule.value);
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

export async function listSurveys(status?: string) {
  const pool = await getPool();
  const request = pool.request();
  let where = 'WHERE 1=1';
  if (status) {
    where += ' AND s.Status = @status';
    request.input('status', sql.VarChar(20), status);
  }
  const result = await request.query(`
    SELECT s.SurveyID, s.Title, s.BusinessUnit, s.Status, s.CreatedBy, u.Name AS CreatedByName,
           s.CreatedAt, s.UpdatedAt,
           (SELECT COUNT(*) FROM dbo.SurveyQuestion q WHERE q.SurveyID = s.SurveyID) AS QuestionCount,
           (SELECT COUNT(*) FROM dbo.SurveyResponse r WHERE r.SurveyID = s.SurveyID) AS ResponseCount
    FROM dbo.Survey s
    JOIN dbo.[User] u ON u.UserID = s.CreatedBy
    ${where}
    ORDER BY s.CreatedAt DESC
  `);
  return result.recordset;
}

export async function getSurvey(id: number) {
  const pool = await getPool();
  const surveyResult = await pool.request().input('id', sql.Int, id).query(`
    SELECT s.SurveyID, s.Title, s.BusinessUnit, s.Status, s.CreatedBy, u.Name AS CreatedByName, s.CreatedAt, s.UpdatedAt
    FROM dbo.Survey s
    JOIN dbo.[User] u ON u.UserID = s.CreatedBy
    WHERE s.SurveyID = @id
  `);
  const survey = surveyResult.recordset[0];
  if (!survey) throw new NotFoundError('Survey not found');

  const questionResult = await pool.request().input('id', sql.Int, id).query(`
    SELECT QuestionID, SurveyID, QuestionType, QuestionText, OptionsJSON, LogicRuleJSON, IsRequired, MinValue, MaxValue, SortOrder
    FROM dbo.SurveyQuestion
    WHERE SurveyID = @id
    ORDER BY SortOrder, QuestionID
  `);

  return {
    ...survey,
    questions: questionResult.recordset.map((q: Record<string, unknown>) => ({
      questionId: q.QuestionID,
      surveyId: q.SurveyID,
      questionType: q.QuestionType,
      questionText: q.QuestionText,
      options: q.OptionsJSON ? JSON.parse(q.OptionsJSON as string) : undefined,
      logicRule: q.LogicRuleJSON ? JSON.parse(q.LogicRuleJSON as string) : undefined,
      isRequired: Boolean(q.IsRequired),
      minValue: q.MinValue,
      maxValue: q.MaxValue,
      sortOrder: q.SortOrder,
    })),
  };
}

export async function createSurvey(userId: number, input: SurveyInput) {
  assertSurveyInput(input);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const surveyResult = await request
      .input('title', sql.NVarChar(200), input.title)
      .input('businessUnit', sql.VarChar(100), input.businessUnit)
      .input('createdBy', sql.Int, userId)
      .query(`
        INSERT INTO dbo.Survey (Title, BusinessUnit, Status, CreatedBy)
        VALUES (@title, @businessUnit, 'Draft', @createdBy);
        SELECT SCOPE_IDENTITY() AS SurveyID;
      `);
    const surveyId = Number(surveyResult.recordset[0].SurveyID);
    request.input('surveyId', sql.Int, surveyId);

    for (let i = 0; i < input.questions.length; i += 1) {
      const q = input.questions[i];
      await request
        .input(`type${i}`, sql.VarChar(20), q.questionType)
        .input(`text${i}`, sql.NVarChar(1000), q.questionText)
        .input(`options${i}`, sql.NVarChar(sql.MAX), q.options ? JSON.stringify(q.options) : null)
        .input(`logic${i}`, sql.NVarChar(sql.MAX), q.logicRule ? JSON.stringify(q.logicRule) : null)
        .input(`required${i}`, sql.Bit, q.isRequired ?? true)
        .input(`min${i}`, sql.Decimal(18, 2), q.minValue ?? null)
        .input(`max${i}`, sql.Decimal(18, 2), q.maxValue ?? null)
        .input(`sort${i}`, sql.Int, q.sortOrder ?? i)
        .query(`
          INSERT INTO dbo.SurveyQuestion (SurveyID, QuestionType, QuestionText, OptionsJSON, LogicRuleJSON, IsRequired, MinValue, MaxValue, SortOrder)
          VALUES (@surveyId, @type${i}, @text${i}, @options${i}, @logic${i}, @required${i}, @min${i}, @max${i}, @sort${i});
        `);
    }

    await transaction.commit();
    return getSurvey(surveyId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function updateSurvey(id: number, userId: number, role: string, input: Partial<SurveyInput>) {
  const existing = await getSurvey(id);
  if (existing.Status !== 'Draft') {
    throw new ForbiddenError('A survey cannot be edited once published/closed; clone it instead');
  }
  if (existing.CreatedBy !== userId && role !== 'Administrator') {
    throw new ForbiddenError('Only the creator or an Administrator can edit this survey');
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    if (input.title || input.businessUnit) {
      await request
        .input('id', sql.Int, id)
        .input('title', sql.NVarChar(200), input.title ?? existing.Title)
        .input('businessUnit', sql.VarChar(100), input.businessUnit ?? existing.BusinessUnit)
        .query('UPDATE dbo.Survey SET Title = @title, BusinessUnit = @businessUnit, UpdatedAt = SYSUTCDATETIME() WHERE SurveyID = @id');
    }

    if (input.questions) {
      assertSurveyInput({ title: existing.Title, businessUnit: existing.BusinessUnit, questions: input.questions });
      await request.input('id', sql.Int, id).query('DELETE FROM dbo.SurveyQuestion WHERE SurveyID = @id');
      for (let i = 0; i < input.questions.length; i += 1) {
        const q = input.questions[i];
        await request
          .input(`type${i}`, sql.VarChar(20), q.questionType)
          .input(`text${i}`, sql.NVarChar(1000), q.questionText)
          .input(`options${i}`, sql.NVarChar(sql.MAX), q.options ? JSON.stringify(q.options) : null)
          .input(`logic${i}`, sql.NVarChar(sql.MAX), q.logicRule ? JSON.stringify(q.logicRule) : null)
          .input(`required${i}`, sql.Bit, q.isRequired ?? true)
          .input(`min${i}`, sql.Decimal(18, 2), q.minValue ?? null)
          .input(`max${i}`, sql.Decimal(18, 2), q.maxValue ?? null)
          .input(`sort${i}`, sql.Int, q.sortOrder ?? i)
          .query(`
            INSERT INTO dbo.SurveyQuestion (SurveyID, QuestionType, QuestionText, OptionsJSON, LogicRuleJSON, IsRequired, MinValue, MaxValue, SortOrder)
            VALUES (@id, @type${i}, @text${i}, @options${i}, @logic${i}, @required${i}, @min${i}, @max${i}, @sort${i});
          `);
      }
    }

    await transaction.commit();
    return getSurvey(id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function deleteSurvey(id: number, userId: number, role: string) {
  const existing = await getSurvey(id);
  if (existing.Status !== 'Draft') {
    throw new ForbiddenError('Only Draft surveys can be deleted');
  }
  if (existing.CreatedBy !== userId && role !== 'Administrator') {
    throw new ForbiddenError('Only the creator or an Administrator can delete this survey');
  }
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.SurveyQuestion WHERE SurveyID = @id; DELETE FROM dbo.Survey WHERE SurveyID = @id');
}

export async function publishSurvey(id: number) {
  const existing = await getSurvey(id);
  if (existing.Status === 'Published') throw new BadRequestError('Survey is already published');
  if (existing.questions.length === 0) throw new BadRequestError('A survey must have at least one question before publishing');
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, id)
    .query(`UPDATE dbo.Survey SET Status = 'Published', UpdatedAt = SYSUTCDATETIME() WHERE SurveyID = @id`);
  return getSurvey(id);
}

export async function cloneSurvey(id: number, userId: number) {
  const source = await getSurvey(id);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const insertResult = await request
      .input('title', sql.NVarChar(200), `${source.Title} (Copy)`)
      .input('businessUnit', sql.VarChar(100), source.BusinessUnit)
      .input('createdBy', sql.Int, userId)
      .query(`
        INSERT INTO dbo.Survey (Title, BusinessUnit, Status, CreatedBy)
        VALUES (@title, @businessUnit, 'Draft', @createdBy);
        SELECT SCOPE_IDENTITY() AS SurveyID;
      `);
    const newId = Number(insertResult.recordset[0].SurveyID);

    for (const q of source.questions) {
      await request
        .input('newId', sql.Int, newId)
        .input('type', sql.VarChar(20), q.questionType)
        .input('text', sql.NVarChar(1000), q.questionText)
        .input('options', sql.NVarChar(sql.MAX), q.options ? JSON.stringify(q.options) : null)
        .input('logic', sql.NVarChar(sql.MAX), q.logicRule ? JSON.stringify(q.logicRule) : null)
        .input('required', sql.Bit, q.isRequired)
        .input('min', sql.Decimal(18, 2), q.minValue ?? null)
        .input('max', sql.Decimal(18, 2), q.maxValue ?? null)
        .input('sort', sql.Int, q.sortOrder)
        .query(`
          INSERT INTO dbo.SurveyQuestion (SurveyID, QuestionType, QuestionText, OptionsJSON, LogicRuleJSON, IsRequired, MinValue, MaxValue, SortOrder)
          VALUES (@newId, @type, @text, @options, @logic, @required, @min, @max, @sort);
        `);
    }

    await transaction.commit();
    return getSurvey(newId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function submitResponse(userId: number, input: ResponseInput) {
  const survey = await getSurvey(input.surveyId);
  if (survey.Status !== 'Published') {
    throw new BadRequestError('Responses can only be submitted to a published survey');
  }

  const answerMap = new Map<number, string>();
  for (const a of input.answers) answerMap.set(a.questionId, a.answerValue);

  const questionRows: SurveyQuestionRow[] = (survey.questions as Array<{
    questionId: number;
    questionType: QuestionType;
    questionText: string;
    isRequired: boolean;
    minValue?: number;
    maxValue?: number;
    logicRule?: LogicRule | null;
  }>).map((q) => ({
    QuestionID: q.questionId,
    LogicRuleJSON: q.logicRule ? JSON.stringify(q.logicRule) : null,
  }));

  survey.questions.forEach((q: SurveyQuestionRowItem, index: number) => {
    const position = index + 1;
    const applicable = isQuestionApplicable(position, questionRows, answerMap);
    if (q.isRequired && applicable && !answerMap.has(q.questionId)) {
      throw new BadRequestError(`Question "${q.questionText}" is mandatory and has not been answered`);
    }
    if (answerMap.has(q.questionId) && q.questionType === 'Numeric' && q.minValue !== undefined && q.maxValue !== undefined) {
      const val = Number(answerMap.get(q.questionId));
      if (Number.isNaN(val) || val < q.minValue || val > q.maxValue) {
        throw new BadRequestError(`Question "${q.questionText}" must be between ${q.minValue} and ${q.maxValue}`);
      }
    }
    if (answerMap.has(q.questionId) && q.questionType === 'Rating') {
      const val = Number(answerMap.get(q.questionId));
      const min = q.minValue ?? 1;
      const max = q.maxValue ?? 10;
      if (Number.isNaN(val) || val < min || val > max) {
        throw new BadRequestError(`Rating question "${q.questionText}" must be between ${min} and ${max}`);
      }
    }
  });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const responseResult = await request
      .input('surveyId', sql.Int, input.surveyId)
      .input('userId', sql.Int, userId)
      .input('outletId', sql.Int, input.outletId ?? null)
      .input('respondentType', sql.VarChar(50), input.respondentType ?? null)
      .query(`
        INSERT INTO dbo.SurveyResponse (SurveyID, UserID, OutletID, RespondentType, Status)
        VALUES (@surveyId, @userId, @outletId, @respondentType, 'Submitted');
        SELECT SCOPE_IDENTITY() AS ResponseID;
      `);
    const responseId = Number(responseResult.recordset[0].ResponseID);

    for (const a of input.answers) {
      await request
        .input('responseId', sql.Int, responseId)
        .input('questionId', sql.Int, a.questionId)
        .input('answerValue', sql.NVarChar(sql.MAX), a.answerValue)
        .query(`
          INSERT INTO dbo.SurveyAnswer (ResponseID, QuestionID, AnswerValue)
          VALUES (@responseId, @questionId, @answerValue);
        `);
    }

    await transaction.commit();
    return { responseId, surveyId: input.surveyId, status: 'Submitted' };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function listResponses(surveyId: number) {
  const pool = await getPool();
  const result = await pool.request().input('surveyId', sql.Int, surveyId).query(`
    SELECT
      r.ResponseID, r.SurveyID, r.UserID, u.Name AS RespondentName, r.OutletID, o.OutletName,
      r.RespondentType, r.Status, r.CreatedAt,
      (SELECT COUNT(*) FROM dbo.SurveyAnswer a WHERE a.ResponseID = r.ResponseID) AS AnswerCount
    FROM dbo.SurveyResponse r
    JOIN dbo.[User] u ON u.UserID = r.UserID
    LEFT JOIN dbo.Outlet o ON o.OutletID = r.OutletID
    WHERE r.SurveyID = @surveyId
    ORDER BY r.CreatedAt DESC
  `);
  return result.recordset;
}

function assertSurveyInput(input: SurveyInput): void {
  if (!input.title || input.title.trim().length === 0) throw new BadRequestError('Survey title is required');
  if (!input.businessUnit || input.businessUnit.trim().length === 0) throw new BadRequestError('Business unit is required');
  for (const q of input.questions) {
    if (!VALID_QUESTION_TYPES.includes(q.questionType)) {
      throw new BadRequestError(`Invalid question type '${q.questionType}'`);
    }
    if (!q.questionText || q.questionText.trim().length === 0) throw new BadRequestError('Question text is required');
    if ((q.questionType === 'SingleChoice' || q.questionType === 'MultiChoice') && (!q.options || q.options.length < 2)) {
      throw new BadRequestError(`Choice question "${q.questionText}" requires at least two options`);
    }
  }
}
