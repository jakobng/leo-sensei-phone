export const requiredPhase = (card) =>
  card?.promptDirection === "reverse"
    ? "reverse"
    : card?.requiresReading
      ? "reading"
      : "meaning";

const reviewProgress = (daily) => ((scheduled, reactivations) => ({
  attempted: scheduled.attempted + reactivations.attempted,
  cleared: scheduled.eventuallyCorrect + reactivations.eventuallyCorrect,
  required: scheduled.required + reactivations.required,
}))(daily.progress.scheduled, daily.progress.reactivations);

export const reviewReserve = (daily) => ((progress) => ((completed, backlogRemaining) => ((total) => ({
  completed,
  backlogRemaining,
  gateCleared: progress.cleared,
  total,
  threshold: progress.required,
  markerPct: total > 0 ? Math.min(100, progress.required / total * 100) : 0,
  fillPct: total > 0 ? Math.min(100, completed / total * 100) : 0,
  unlocked: Boolean(daily.complete),
}))(progress.required + Number(daily.extraReviewsDone ?? 0) + backlogRemaining))(
  progress.cleared + Number(daily.extraReviewsDone ?? 0),
  Number(daily.availableReviews ?? 0),
))(reviewProgress(daily));

const selectedCard = (daily, currentId) => daily?.queue?.find(({ id }) => id === currentId) ?? null;

const reconciledReviewQueue = (previousDaily, refreshedDaily, currentId, correct) => ((entriesById) => ((preservedIds) => [
  ...(previousDaily?.queue ?? [])
    .filter(({ id }) => id !== currentId && entriesById.has(id))
    .map(({ id }) => entriesById.get(id)),
  ...(refreshedDaily?.queue ?? [])
    .filter(({ id }) => id !== currentId && !preservedIds.has(id)),
  ...(!correct && entriesById.has(currentId) ? [entriesById.get(currentId)] : []),
])(new Set((previousDaily?.queue ?? [])
  .map(({ id }) => id)
  .filter((id) => id !== currentId && entriesById.has(id)))))(
  new Map((refreshedDaily?.queue ?? []).map((entry) => [entry.id, entry])),
);

const reconcileDailyReview = (previousDaily, refreshedDaily, currentId, correct) => ({
  ...refreshedDaily,
  queue: reconciledReviewQueue(previousDaily, refreshedDaily, currentId, correct),
});

export const initialUiState = (daily = null) => ({
  daily,
  currentId: daily?.queue?.[0]?.id ?? null,
  phase: requiredPhase(daily?.queue?.[0]),
  readingAnswer: "",
  feedback: null,
  previousAnswer: null,
  answerReturn: null,
  retryNotice: null,
  bypassOpen: false,
  submitting: false,
  aliasSaving: false,
  savedAlias: null,
  statsTab: "kanji",
  studyListDetail: null,
  studyListSort: "default",
  kanjiDetail: null,
  referenceHistory: [],
  grammar: null,
  homeGrammar: null,
  summaryOpen: false,
  lessonPreviewIndex: daily?.lesson && !daily.complete && (daily.lessonCards?.length ?? 0) > 0 ? 0 : -1,
  error: null,
});

const knownPreviewIndex = (state, daily) => state.lessonPreviewIndex < 0
  ? initialUiState(daily).lessonPreviewIndex
  : daily?.lessonGroup?.index !== state.daily?.lessonGroup?.index
    ? (daily?.lessonCards?.length ?? 0) > 0 ? 0 : -1
    : state.lessonPreviewIndex < (daily?.lessonCards?.length ?? 0) ? state.lessonPreviewIndex : -1;

const lastAnswer = (state) => state.feedback
  ? (({ daily, ...feedback }) => ({ cardId: state.currentId, feedback }))(state.feedback)
  : state.previousAnswer;

const reducers = Object.freeze({
  daily_loaded: (_state, event) => initialUiState(event.daily),
  selected: (state, event) => ({
    ...state,
    currentId: event.cardId,
    phase: requiredPhase(selectedCard(state.daily, event.cardId)),
    readingAnswer: "",
    feedback: null,
    retryNotice: null,
    error: null,
  }),
  reading_entered: (state, event) => ({ ...state, phase: "meaning", readingAnswer: event.answer, error: null }),
  request_started: (state) => ({ ...state, submitting: true, error: null }),
  review_recorded: (state, event) => ({
    ...state,
    daily: reconcileDailyReview(state.daily, event.daily, state.currentId, event.feedback.correct),
    feedback: {
      ...event.feedback,
      cardType: selectedCard(state.daily, state.currentId)?.type ?? "vocabulary",
    },
    retryNotice: null,
    lessonPreviewIndex: state.daily?.lesson
      && (event.daily.lessonCards?.length ?? 0) > 0
      && event.daily.lessonGroup?.index !== state.daily.lessonGroup?.index
      ? 0
      : state.lessonPreviewIndex,
    submitting: false,
    error: null,
  }),
  review_retry: (state, event) => ({
    ...state,
    daily: event.daily,
    readingAnswer: "",
    feedback: null,
    retryNotice: event.message,
    submitting: false,
    error: null,
  }),
  review_redone: (state, event) => ({
    ...state,
    daily: event.daily,
    currentId: event.cardId,
    phase: requiredPhase(selectedCard(event.daily, event.cardId)),
    readingAnswer: "",
    feedback: null,
    retryNotice: null,
    submitting: false,
    error: null,
  }),
  known_recorded: (state, event) => ({
    ...state,
    ...initialUiState(event.daily),
    previousAnswer: lastAnswer(state),
    lessonPreviewIndex: knownPreviewIndex(state, event.daily),
  }),
  alias_started: (state) => ({ ...state, aliasSaving: true, savedAlias: null, error: null }),
  alias_saved: (state, event) => ({
    ...state,
    aliasSaving: false,
    savedAlias: { cardId: event.cardId, kind: event.kind },
    feedback: state.feedback ? { ...state.feedback, aliasSaved: event.kind } : null,
    error: null,
  }),
  continue: (state) => state.answerReturn ? state : ({
    ...state,
    previousAnswer: lastAnswer(state),
    currentId: state.daily?.queue?.[0]?.id ?? null,
    phase: requiredPhase(state.daily?.queue?.[0]),
    readingAnswer: "",
    feedback: null,
    retryNotice: null,
    savedAlias: null,
    error: null,
  }),
  previous_answer_opened: (state, event) => state.previousAnswer && !state.answerReturn && !state.submitting && !state.aliasSaving
    ? { ...state, answerReturn: event.returnView } : state,
  previous_answer_closed: (state) => state.answerReturn ? { ...state, answerReturn: null } : state,
  summary_opened: (state) => ({ ...state, summaryOpen: true, error: null }),
  summary_closed: (state) => ({ ...state, summaryOpen: false, error: null }),
  lesson_preview_next: (state) => ({ ...state, lessonPreviewIndex: state.lessonPreviewIndex + 1, savedAlias: null, error: null }),
  lesson_preview_finished: (state) => ({ ...state, lessonPreviewIndex: -1, savedAlias: null, error: null }),
  bypass_opened: (state) => ({ ...state, bypassOpen: true, error: null }),
  bypass_closed: (state) => ({ ...state, bypassOpen: false, error: null }),
  stats_tab_selected: (state, event) => ({ ...state, statsTab: event.statsTab }),
  study_lists_saved: (state, event) => ({ ...state, studyLists: event.lists, error: null }),
  study_list_opened: (state, event) => ({
    ...state,
    view: event.view ?? state.view,
    studyListDetail: {
      id: event.id,
      label: event.label,
      loading: true,
      ...(event.backView ? { backView: event.backView } : {}),
      ...(event.cardType ? { cardType: event.cardType } : {}),
      ...(event.band ? { band: event.band } : {}),
    },
    error: null,
  }),
  study_list_loaded: (state, event) => ({
    ...state,
    studyListDetail: { ...state.studyListDetail, ...event.list, loading: false },
    error: null,
  }),
  study_list_closed: (state) => ({
    ...state,
    view: state.studyListDetail?.backView ?? state.view,
    studyListDetail: null,
    studyListSort: "default",
    error: null,
  }),
  study_list_sort_selected: (state, event) => ({ ...state, studyListSort: event.sort, error: null }),
  kanji_opened: (state, event) => ({ ...state, kanjiDetail: { literal: event.literal, loading: true }, error: null }),
  kanji_loaded: (state, event) => ({ ...state, kanjiDetail: event.kanji, error: null }),
  kanji_closed: (state) => ({ ...state, kanjiDetail: null, referenceHistory: [], error: null }),
  reference_opened: (state, event) => ((history) => ({
    ...state,
    referencePageScroll: state.kanjiDetail ? state.referencePageScroll : event.pageScroll ?? 0,
    referenceHistory: history,
    kanjiDetail: { item: event.item, literal: event.item, type: event.cardType, loading: true,
      requestKey: event.requestKey, hasPrevious: history.length > 0 },
  }))(state.kanjiDetail && !state.kanjiDetail.loading
    ? [...state.referenceHistory, { ...state.kanjiDetail,
        scrollTop: event.previousScroll ?? 0, comparisonOpen: event.previousComparisons ?? [],
      }] : state.referenceHistory),
  reference_loaded: (state, event) => state.kanjiDetail?.requestKey === event.requestKey
    ? { ...state, kanjiDetail: { ...event.detail, requestKey: event.requestKey, hasPrevious: state.referenceHistory.length > 0 } }
    : state,
  reference_failed: (state, event) => state.kanjiDetail?.requestKey === event.requestKey
    ? { ...state, kanjiDetail: { ...state.kanjiDetail, loading: false, referenceError: event.error } } : state,
  reference_back: (state) => state.referenceHistory.length
    ? { ...state, kanjiDetail: state.referenceHistory.at(-1), referenceHistory: state.referenceHistory.slice(0, -1) } : state,
  grammar_opened: (state) => ({
    ...state,
    grammar: {
      view: "menu",
      summary: state.grammar?.summary ?? state.homeGrammar,
      review: null,
      lessons: null,
      lessonDetail: null,
      newLesson: null,
    },
    error: null,
  }),
  grammar_summary_loaded: (state, event) => ({
    ...state,
    grammar: { ...state.grammar, summary: event.summary },
    error: null,
  }),
  home_grammar_loaded: (state, event) => ({ ...state, homeGrammar: event.summary, error: null }),
  grammar_newlesson_started: (state, event) => ({
    ...state,
    grammar: {
      view: "newlesson",
      summary: state.grammar?.summary ?? state.homeGrammar,
      review: null,
      lessons: null,
      lessonDetail: null,
      newLesson: { cards: event.cards, index: 0, more: Boolean(event.more) },
    },
    submitting: false,
    error: null,
  }),
  grammar_newlesson_next: (state) => ((newLesson) => ({
    ...state,
    grammar: { ...state.grammar, newLesson: { ...newLesson, index: newLesson.index + 1 } },
    submitting: false,
    error: null,
  }))(state.grammar.newLesson),
  grammar_menu: (state) => ({
    ...state,
    grammar: { ...state.grammar, view: "menu", review: null, lessonDetail: null, newLesson: null },
    error: null,
  }),
  grammar_review_loaded: (state, event) => ({
    ...state,
    grammar: {
      ...state.grammar,
      view: "review",
      review: { queue: event.queue, remaining: event.remaining, index: 0, feedback: null, done: event.queue.length === 0 },
    },
    submitting: false,
    error: null,
  }),
  grammar_answered: (state, event) => ({
    ...state,
    grammar: { ...state.grammar, review: { ...state.grammar.review, feedback: event.feedback } },
    submitting: false,
    error: null,
  }),
  grammar_next: (state) => ((review) => ({
    ...state,
    grammar: {
      ...state.grammar,
      review: { ...review, index: review.index + 1, feedback: null, done: review.index + 1 >= review.queue.length },
    },
    error: null,
  }))(state.grammar.review),
  grammar_lessons_loaded: (state, event) => ({
    ...state,
    grammar: {
      ...state.grammar,
      view: "lessons",
      lessons: { level: event.level, filter: event.filter, points: event.points },
      lessonDetail: null,
    },
    error: null,
  }),
  grammar_lesson_opened: (state, event) => ({
    ...state,
    grammar: { ...state.grammar, view: "lesson", lessonDetail: { id: event.id, loading: true } },
    error: null,
  }),
  grammar_lesson_loaded: (state, event) => ({
    ...state,
    grammar: { ...state.grammar, lessonDetail: event.detail },
    error: null,
  }),
  grammar_lesson_added: (state, event) => ((increment) => ({
    ...state,
    grammar: {
      ...state.grammar,
      summary: state.grammar.summary
        ? {
            ...state.grammar.summary,
            pool: Number(state.grammar.summary.pool ?? 0) + increment,
            newToday: Math.min(
              Number(state.grammar.summary.newLimit ?? 0),
              Number(state.grammar.summary.newToday ?? 0) + increment,
            ),
            newAvailable: Math.max(0, Number(state.grammar.summary.newAvailable ?? 0) - increment),
          }
        : state.grammar.summary,
      lessonDetail: state.grammar.lessonDetail
        ? { ...state.grammar.lessonDetail, inPool: true }
        : state.grammar.lessonDetail,
      lessons: state.grammar.lessons
        ? {
            ...state.grammar.lessons,
            points: state.grammar.lessons.points.map((point) => point.id === state.grammar.lessonDetail?.id
              ? { ...point, inPool: true }
              : point),
          }
        : state.grammar.lessons,
    },
    submitting: false,
    error: null,
  }))(event.added === false ? 0 : 1),
  request_failed: (state, event) => ({ ...state, submitting: false, aliasSaving: false, error: event.error }),
});

export const reduceUi = (state, event) => (reducers[event.type] ?? ((value) => value))(state, event);
