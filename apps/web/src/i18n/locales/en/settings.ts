/** English appearance and timestamp labels for the initial UI migration. */
export const settings = {
  sections: {
    appearanceLanguage: "Language",
  },
  rows: {
    language: {
      title: "Language",
      description: "Choose the interface language for this device. Changing it reloads the page.",
      ariaLabel: "Language",
      reset: "Reset language to follow system",
      options: {
        system: "Follow system",
      },
      saveError: "Language not saved",
      saveErrorDescription:
        "Your browser could not save the language preference. Please try again.",
    },
    timeFormat: {
      title: "Time format",
      description: "System default follows your browser or OS clock preference.",
      ariaLabel: "Timestamp format",
      options: {
        twelveHour: "12-hour",
        twentyFourHour: "24-hour",
      },
    },
  },
};
