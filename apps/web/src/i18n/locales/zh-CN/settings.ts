/** Chinese appearance and timestamp labels checked at the literal declaration. */
import type { Messages } from "../en";

export const settings: Messages["settings"] = {
  sections: {
    appearanceLanguage: "语言",
  },
  rows: {
    language: {
      title: "语言",
      description: "选择此设备的界面语言。切换后页面会刷新。",
      ariaLabel: "语言",
      reset: "将语言恢复为跟随系统",
      options: {
        system: "跟随系统",
      },
      saveError: "语言设置未保存",
      saveErrorDescription: "浏览器无法保存语言设置，请重试。",
    },
    timeFormat: {
      title: "时间格式",
      description: "系统默认使用浏览器或操作系统的时钟格式。",
      ariaLabel: "时间格式",
      options: {
        twelveHour: "12 小时制",
        twentyFourHour: "24 小时制",
      },
    },
  },
};
