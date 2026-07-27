import { moment } from "obsidian";
import en from "./en";
import ru from "./ru";

// To add a language, copy en.ts, translate the values, and list it here under
// the locale code Obsidian reports. English is the fallback for everything else.
const localeMap: { [key: string]: typeof en } = {
    en,
    ru,
};

const lang = moment.locale();
export const t = localeMap[lang] || localeMap.en;
