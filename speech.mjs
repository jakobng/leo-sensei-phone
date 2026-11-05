const firstAcceptedReading = (value) => String(value ?? "")
  .split(";")
  .map((reading) => reading.trim())
  .find(Boolean) ?? "";

const silentAudio = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";

const japaneseVoice = (voices) => [...voices]
  .filter(({ lang }) => String(lang).toLowerCase().startsWith("ja"))
  .toSorted((left, right) =>
    Number(right.localService) - Number(left.localService)
    || Number(String(right.lang).toLowerCase() === "ja-jp") - Number(String(left.lang).toLowerCase() === "ja-jp")
    || String(left.name).localeCompare(String(right.name)))
  .at(0) ?? null;

export const japaneseSpeechText = (feedback) => String(
  feedback?.readingCorrect && feedback?.submittedReading
    ? feedback.submittedReading
    : firstAcceptedReading(feedback?.expectedReading) || feedback?.expectedSurface || "",
).trim();

export const playJapaneseSpeech = ({ synthesis, Utterance, text }) =>
  synthesis
    && typeof synthesis.cancel === "function"
    && typeof synthesis.getVoices === "function"
    && typeof synthesis.speak === "function"
    && typeof Utterance === "function"
    && String(text ?? "").trim()
    ? ((voice) => ((utterance) => (
        synthesis.cancel(),
        synthesis.speak(utterance),
        true
      ))(Object.assign(
        new Utterance(String(text).trim()),
        {
          lang: "ja-JP",
          rate: 0.88,
          pitch: 1,
          ...(voice ? { voice } : {}),
        },
      )))(japaneseVoice(synthesis.getVoices()))
    : false;

export const primeNeuralJapaneseSpeech = (player) =>
  player
    && typeof player.play === "function"
    && typeof player.setAttribute === "function"
    ? (
        player.setAttribute("src", silentAudio),
        Promise.resolve(player.play()).then(
          () => (player.pause(), player.currentTime = 0),
          () => false,
        ),
        true
      )
    : false;

export const playNeuralJapaneseSpeech = ({
  endpoint = "/api/speech",
  player,
  synthesis,
  Utterance,
  text,
}) =>
  player
    && typeof player.pause === "function"
    && typeof player.play === "function"
    && typeof player.getAttribute === "function"
    && typeof player.setAttribute === "function"
    && String(text ?? "").trim()
    ? ((source) => (
        typeof synthesis?.cancel === "function" ? synthesis.cancel() : null,
        player.pause(),
        player.getAttribute("src") === source
          ? player.currentTime = 0
          : player.setAttribute("src", source),
        Promise.resolve(player.play()).catch((playError) => playError?.name === "NotAllowedError"
          ? false
          : playJapaneseSpeech({ synthesis, Utterance, text })),
        true
      ))(`${endpoint}?text=${encodeURIComponent(String(text).trim())}`)
    : playJapaneseSpeech({ synthesis, Utterance, text });

export const cancelJapaneseSpeech = ({ player, synthesis }) => (
  typeof player?.pause === "function" ? player.pause() : null,
  typeof player?.removeAttribute === "function" ? player.removeAttribute("src") : null,
  typeof synthesis?.cancel === "function" ? synthesis.cancel() : null
);
