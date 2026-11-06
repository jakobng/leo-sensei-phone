const conflict = (message) => Object.assign(new Error(message), { code: "SYNC_CONFLICT" });

// Canonical keys compare copies from different files without changing event order.
const ordered = (value) => Array.isArray(value) ? value.map(ordered)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]))
    : value;
export const syncJson = (value) => JSON.stringify(ordered(value));
export const syncEqual = (left, right) => left === right || syncJson(left) === syncJson(right);

const isStudyCard = (card) => ["vocabulary", "kanji"].includes(card.type);
const isStudyEvent = (event) => !event.type.startsWith("grammar_");
const limitsOf = (limits, grammar) => Object.fromEntries(
  Object.entries(limits ?? {}).filter(([key]) => key.startsWith("grammar-") === grammar),
);

export const portableStudy = ({ version, settings, catalog, customLists, events, studyPlan }) => {
  const { gateMode, gatedApplications, studyListDailyNew, ...portableSettings } = settings;
  return {
    version,
    settings: { ...portableSettings, studyListDailyNew: limitsOf(studyListDailyNew, false) },
    catalog: { ...catalog, cards: catalog.cards.filter(isStudyCard) },
    customLists,
    events: events.filter(isStudyEvent),
    ...(studyPlan === undefined ? {} : {
      studyPlan: { ...studyPlan, dailyLimits: limitsOf(studyPlan.dailyLimits, false) },
    }),
  };
};

export const retainLocalStudy = (study, local) => {
  const localStudyEvents = local.events.filter(isStudyEvent);
  const events = appendStudyEvents(localStudyEvents, study.events);
  return {
    ...study,
    settings: {
      ...study.settings,
      gateMode: local.settings.gateMode,
      gatedApplications: local.settings.gatedApplications,
      studyListDailyNew: {
        ...study.settings.studyListDailyNew,
        ...limitsOf(local.settings.studyListDailyNew, true),
      },
    },
    catalog: {
      ...study.catalog,
      cards: [...study.catalog.cards, ...local.catalog.cards.filter((card) => !isStudyCard(card))],
    },
    events: [...local.events, ...events.slice(localStudyEvents.length)],
    ...(study.studyPlan === undefined ? {} : {
      studyPlan: {
        ...study.studyPlan,
        dailyLimits: { ...study.studyPlan.dailyLimits, ...limitsOf(local.studyPlan?.dailyLimits, true) },
      },
    }),
  };
};

const identity = (event, body) => event.eventId ? `id:${event.eventId}` : `body:${body}`;
const eventBody = (event, cache) => {
  if (!cache || typeof event !== "object" || event === null) return syncJson(event);
  if (!cache.has(event)) cache.set(event, syncJson(event));
  return cache.get(event);
};
const indexEvents = (events, eventBodies) => events.reduce((index, event) => {
  const body = eventBody(event, eventBodies);
  const id = identity(event, body);
  if (index.has(id) && index.get(id).body !== body) throw conflict("One review record differs between devices.");
  if (!index.has(id)) index.set(id, { event, body });
  return index;
}, new Map());

const includesEvents = (all, subset) => [...subset].every(([key, { body }]) => all.get(key)?.body === body);
const unionEvents = (first, index, other) => {
  if ([...other].some(([key, { body }]) => index.has(key) && index.get(key).body !== body)) {
    throw conflict("One review record differs between devices.");
  }
  return [...first, ...[...other].filter(([key]) => !index.has(key)).map(([, { event }]) => event)];
};

export const appendStudyEvents = (local, incoming) => {
  const localEvents = indexEvents(local);
  const incomingEvents = indexEvents(incoming);
  if (!includesEvents(incomingEvents, localEvents)) {
    throw conflict("Sync paused because the incoming copy is missing local review history.");
  }
  return unionEvents(local, localEvents, incomingEvents);
};

const mergeValue = (base, local, remote, label) => {
  if (syncEqual(local, base)) return remote;
  if (syncEqual(remote, base) || syncEqual(local, remote)) return local;
  throw conflict(`Both devices changed ${label}. Sync is paused so you can keep both copies.`);
};

const field = (document, key) => Object.hasOwn(document, key) ? document[key] : undefined;
const mergeFields = (base, local, remote, label) => Object.fromEntries(
  [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
    .map((key) => [key, mergeValue(field(base, key), field(local, key), field(remote, key), label)])
    .filter(([, value]) => value !== undefined),
);
const cardsById = (cards) => Object.fromEntries(cards.map((card) => [card.id, card]));
const mergeCatalog = (base, local, remote) => {
  const { cards: baseCards, ...baseFields } = base;
  const { cards: localCards, ...localFields } = local;
  const { cards: remoteCards, ...remoteFields } = remote;
  return {
    ...mergeFields(baseFields, localFields, remoteFields, "the catalog"),
    cards: Object.values(mergeFields(cardsById(baseCards), cardsById(localCards), cardsById(remoteCards), "the same card")),
  };
};

const emptyStudy = (state) => state.events.length === 0 && state.catalog.cards.length === 0
  && state.customLists.length === 0 && !state.studyPlan?.customLists?.length;
const documents = ({ events, ...rest }) => rest;

export const mergeStudy = (base, local, remote, eventBodies) => {
  if (!remote) {
    if (base) throw conflict("The cloud copy is missing. Check the sync repository before reconnecting.");
    return local;
  }
  const localEvents = indexEvents(local.events, eventBodies);
  const remoteEvents = indexEvents(remote.events, eventBodies);
  if (!base) {
    if (emptyStudy(local)) return remote;
    if (emptyStudy(remote)) return local;
    if (syncEqual(documents(local), documents(remote))) {
      if (includesEvents(remoteEvents, localEvents)) return remote;
      if (includesEvents(localEvents, remoteEvents)) return local;
    }
    throw conflict("Both devices already have different study data. Start by connecting the device with your main history, then connect a fresh browser on the other device.");
  }

  const baseEvents = indexEvents(base.events, eventBodies);
  if (!includesEvents(localEvents, baseEvents) || !includesEvents(remoteEvents, baseEvents)) {
    throw conflict("One device restored an older copy of your history. Sync is paused so you can keep both copies.");
  }
  if (base.studyPlan && (!local.studyPlan || !remote.studyPlan)) {
    throw conflict("A synced study document is missing from one device. Sync is paused so you can keep both copies.");
  }
  // Keep cloud history in order; a device appends only events it has not seen.
  const events = unionEvents(remote.events, remoteEvents, localEvents);
  const settings = mergeFields(base.settings, local.settings, remote.settings, "the same study setting");
  const catalog = mergeCatalog(base.catalog, local.catalog, remote.catalog);
  const customLists = mergeValue(base.customLists, local.customLists, remote.customLists, "the imported lists");
  const studyPlan = base.studyPlan && local.studyPlan && remote.studyPlan
    ? mergeFields(base.studyPlan, local.studyPlan, remote.studyPlan, "the study lists")
    : mergeValue(base.studyPlan, local.studyPlan, remote.studyPlan, "the study lists");
  return {
    version: 2, events, settings, catalog, customLists,
    ...(studyPlan === undefined ? {} : { studyPlan }),
  };
};

export const studyContains = (current, incoming, eventBodies) => syncEqual(documents(current), documents(incoming))
  && includesEvents(indexEvents(current.events, eventBodies), indexEvents(incoming.events, eventBodies));
