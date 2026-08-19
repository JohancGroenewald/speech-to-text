const SLACK_BROADCAST_MENTIONS = [
  { token: '@channel', spoken: /\bat[\s-]+channel\b/giu },
  { token: '@here', spoken: /\bat[\s-]+here\b/giu }
];

function normalizePromptedSlackMentions(text, prompt = '') {
  const requestedFormatting = String(prompt).toLowerCase();
  let normalized = String(text);

  for (const { token, spoken } of SLACK_BROADCAST_MENTIONS) {
    if (requestedFormatting.includes(token)) {
      normalized = normalized.replace(spoken, token);
    }
  }

  return normalized;
}

module.exports = {
  normalizePromptedSlackMentions
};
