// Valor da aula: override congelado na aula (l.hourlyRate) ou rate dinâmico do aluno.
// 0 é override válido (aula gratuita) — por isso ??, nunca ||.
export function lessonRate(lesson, student) {
  return lesson.hourlyRate ?? (student?.hourlyRate || 0);
}

export function lessonValue(lesson, student) {
  return (lesson.durationMinutes / 60) * lessonRate(lesson, student);
}
