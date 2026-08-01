import { pinyin } from "pinyin-pro";
import type { StudentDirectoryInitial } from "./studentDirectoryShared";
export {
  STUDENT_DIRECTORY_INITIALS,
  type StudentDirectoryInitial,
} from "./studentDirectoryShared";

type StudentIdentity = {
  id: number;
  username: string;
};

const pinyinCollator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
  usage: "sort",
});

const originalNameCollator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "variant",
  usage: "sort",
});

function isChineseName(value: string) {
  return /^\p{Script=Han}+$/u.test(value);
}

function getPinyinParts(value: string) {
  const surnameMode = isChineseName(value);
  return pinyin(value, {
    mode: surnameMode ? "surname" : "normal",
    nonZh: "consecutive",
    surname: surnameMode ? "head" : "off",
    toneType: "none",
    type: "array",
  });
}

export function getStudentDirectoryMetadata(username: string) {
  const normalized = username.trim();
  const firstCharacter = Array.from(normalized)[0] ?? "";
  const pinyinParts = normalized ? getPinyinParts(normalized) : [];
  const firstPinyin = pinyinParts[0] ?? "";
  const possibleInitial = /[A-Za-z]/.test(firstCharacter)
    ? firstCharacter
    : /^\p{Script=Han}$/u.test(firstCharacter)
      ? firstPinyin.charAt(0)
      : "";
  const upperInitial = possibleInitial.toUpperCase();
  const initial = /^[A-Z]$/.test(upperInitial)
    ? (upperInitial as StudentDirectoryInitial)
    : "#";

  return {
    initial,
    sortKey: pinyinParts.join(" ").toLocaleLowerCase("zh-CN") || normalized,
  };
}

export function sortStudentsByDirectory<T extends StudentIdentity>(students: T[]) {
  return students
    .map((student) => ({
      directory: getStudentDirectoryMetadata(student.username),
      student,
    }))
    .sort((left, right) => {
      const leftOther = left.directory.initial === "#";
      const rightOther = right.directory.initial === "#";
      if (leftOther !== rightOther) return leftOther ? 1 : -1;

      return (
        pinyinCollator.compare(
          left.directory.sortKey,
          right.directory.sortKey,
        ) ||
        originalNameCollator.compare(
          left.student.username,
          right.student.username,
        ) ||
        left.student.id - right.student.id
      );
    })
    .map(({ directory, student }) => ({
      ...student,
      directoryInitial: directory.initial,
      directorySortKey: directory.sortKey,
    }));
}
