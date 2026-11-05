const gateModes = new Set(["off", "prompt", "redirect"]);

const applicationIdentity = (application) => typeof application === "string"
  ? application.trim()
  : String(application?.identity ?? application?.bundleId ?? application?.executable ?? "").trim();

export const gatedApplicationOptions = (applications = []) => applications.reduce(
  (options, application) => ((identity) => identity && !options.some((option) => option.identity === identity)
    ? [...options, {
        identity,
        name: String(application?.displayName ?? application?.name ?? identity).trim(),
      }]
    : options)(applicationIdentity(application)),
  [],
);

const normalizedDailyNew = (value = {}) => Object.fromEntries(Object.entries(value)
  .map(([id, count]) => [String(id).trim(), Number(count)]));

const validDailyNew = (dailyNew) => Object.entries(dailyNew).every(([id, count]) => id
  && Number.isInteger(count)
  && count >= 0
  && count <= 100);

export const validateOnboarding = ({ studyListDailyNew = {}, requiredDailyCount, gateMode, selectedBrowsers = [] }) => ((dailyNew) => [
  ...(validDailyNew(dailyNew) && Object.values(dailyNew).some((count) => count > 0)
    ? []
    : ["Set New / day above zero for at least one study list."]),
  ...(Number.isInteger(Number(requiredDailyCount)) && Number(requiredDailyCount) > 0
    ? []
    : ["Daily reviews must be a positive whole number."]),
  ...(gateModes.has(gateMode) ? [] : ["Choose a gate mode."]),
  ...(gateMode !== "redirect" || selectedBrowsers.length > 0
    ? []
    : ["Choose at least one browser when gating is active."]),
])(normalizedDailyNew(studyListDailyNew));

export const onboardingSettings = ({
  studyListDailyNew,
  requiredDailyCount,
  gateMode,
  selectedBrowsers = [],
  selectedApplications = [],
}) => ((browsers, gatedApplications, dailyNew) => ((issues) => issues.length > 0
  ? { ok: false, error: issues }
  : {
      ok: true,
      value: Object.freeze({
        version: 2,
        requiredDailyCount: Number(requiredDailyCount),
        studyListDailyNew: Object.freeze(dailyNew),
        gateMode,
        gatedApplications: Object.freeze(gatedApplications),
        onboardingComplete: true,
      }),
    })(validateOnboarding({ studyListDailyNew: dailyNew, requiredDailyCount, gateMode, selectedBrowsers: browsers })))(
  [...new Set(selectedBrowsers.map(applicationIdentity).filter(Boolean))],
  [
  ...new Set([
    ...selectedBrowsers.map(applicationIdentity),
    ...selectedApplications.map(applicationIdentity),
  ].filter(Boolean)),
], normalizedDailyNew(studyListDailyNew));
