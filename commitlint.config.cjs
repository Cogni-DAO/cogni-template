module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-prohibited-words": [2, "always"],
    "subject-prohibited-words": [2, "always"],
  },
  plugins: [
    {
      rules: {
        "body-prohibited-words": (parsed) => {
          const prohibitedWords = [
            "complete",
            "comprehensive",
            "final",
            "production ready",
          ];
          const body = parsed.body || "";

          for (const word of prohibitedWords) {
            const regex = new RegExp(`\\b${word}\\b`, "gi");
            if (regex.test(body)) {
              return [
                false,
                `Prohibited word "${word}" found in commit body - these words are red flags and indicate improper understanding`,
              ];
            }
          }
          return [true];
        },
        "subject-prohibited-words": (parsed) => {
          const prohibitedWords = [
            "complete",
            "comprehensive",
            "final",
            "production ready",
          ];
          const subject = parsed.subject || "";

          for (const word of prohibitedWords) {
            const regex = new RegExp(`\\b${word}\\b`, "gi");
            if (regex.test(subject)) {
              return [
                false,
                `Prohibited word "${word}" found in commit subject - these words are red flags and indicate improper understanding`,
              ];
            }
          }
          return [true];
        },
      },
    },
  ],
};
