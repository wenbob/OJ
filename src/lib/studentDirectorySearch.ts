export function filterStudentsByUsername<T extends { username: string }>(
  students: T[],
  keyword: string,
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("zh-CN");
  if (!normalizedKeyword) return students;
  return students.filter((student) =>
    student.username.toLocaleLowerCase("zh-CN").includes(normalizedKeyword),
  );
}
