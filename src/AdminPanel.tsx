import { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  doc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Archive, CalendarCheck, CalendarPlus, CalendarX, MoveRight, Plus, Trash2, UserRound, X } from 'lucide-react';
import { db } from './firebase';

type HomeworkAttachment = {
  name: string;
  url: string;
};

type Student = {
  id: string;
  displayName: string;
  contactEmail?: string;
  notes?: string;
  status: 'active' | 'archived';
  createdAt?: Timestamp;
};

type Subscription = {
  id: string;
  studentId: string;
  kind: 'package_4' | 'package_8' | 'single';
  totalLessons: number;
  remainingLessons: number;
  status: 'active' | 'pending_payment' | 'expired';
  expiresAt?: Timestamp | null;
};

type Lesson = {
  id: string;
  studentId: string;
  lessonType: 'individual' | 'group';
  startAt: Timestamp;
  endAt: Timestamp;
  seriesId: string | null;
  status: 'confirmed' | 'cancelled' | 'completed';
  teacherComment?: string;
  materials?: string;
  homework?: string;
  homeworkAttachments?: HomeworkAttachment[];
};

type Props = {
  onClose: () => void;
};

export function AdminPanel({ onClose }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonSaving, setLessonSaving] = useState(false);
  const [movingLessonId, setMovingLessonId] = useState<string | null>(null);
  const [moveDateTime, setMoveDateTime] = useState('');
  const [completingLessonId, setCompletingLessonId] = useState<string | null>(null);
  const [lessonComment, setLessonComment] = useState('');
  const [lessonMaterials, setLessonMaterials] = useState('');
  const [lessonHomework, setLessonHomework] = useState('');
  const [lessonAttachmentName, setLessonAttachmentName] = useState('');
  const [lessonAttachmentUrl, setLessonAttachmentUrl] = useState('');
  const subscriptionLinksChecked = useRef(false);

  useEffect(() => {
    const studentsQuery = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
    return onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Student));
      setLoading(false);
      setError('');
    }, () => {
      setLoading(false);
      setError('Не удалось загрузить учеников. Проверьте правила Firestore.');
    });
  }, []);

  useEffect(() => {
    const lessonsQuery = query(collection(db, 'lessons'), orderBy('startAt', 'asc'));
    return onSnapshot(lessonsQuery, (snapshot) => {
      setLessons(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Lesson));
    }, () => setError('Не удалось загрузить расписание.'));
  }, []);

  useEffect(() => {
    const subscriptionsQuery = query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'));
    return onSnapshot(subscriptionsQuery, (snapshot) => {
      setSubscriptions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Subscription));
    }, () => setError('Не удалось загрузить абонементы.'));
  }, []);

  useEffect(() => {
    if (loading || subscriptions.length === 0 || subscriptionLinksChecked.current) return;
    const natasha = students.find((student) => student.displayName.trim().toLocaleLowerCase('ru-RU') === 'наташа')
      ?? (students.length === 1 ? students[0] : null);
    if (!natasha) {
      subscriptionLinksChecked.current = true;
      return;
    }

    const validStudentIds = new Set(students.map((student) => student.id));
    const orphanedSubscriptions = subscriptions.filter((subscription) => !validStudentIds.has(subscription.studentId));
    const subscriptionsToRepair = orphanedSubscriptions.length > 0
      ? orphanedSubscriptions
      : subscriptions.some((subscription) => subscription.studentId === natasha.id)
        ? []
        : students.length === 1 ? subscriptions : [];
    if (subscriptionsToRepair.length === 0) {
      subscriptionLinksChecked.current = true;
      return;
    }

    subscriptionLinksChecked.current = true;
    const repairLinks = async () => {
      try {
        const batch = writeBatch(db);
        subscriptionsToRepair.forEach((subscription) => {
          batch.update(doc(db, 'subscriptions', subscription.id), {
            studentId: natasha.id,
            linkedStudentName: natasha.displayName,
            linkRepairedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } catch {
        setError('Не удалось автоматически привязать абонемент Наташи.');
      }
    };
    void repairLinks();
  }, [loading, students, subscriptions]);

  const addStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const displayName = String(form.get('displayName') ?? '').trim();
    const contactEmail = String(form.get('contactEmail') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();
    if (!displayName) return;

    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'students'), {
        displayName,
        contactEmail,
        notes,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      formElement.reset();
    } catch {
      setError('Не удалось сохранить ученика.');
    } finally {
      setSaving(false);
    }
  };

  const archiveStudent = async (student: Student) => {
    try {
      await updateDoc(doc(db, 'students', student.id), {
        status: student.status === 'active' ? 'archived' : 'active',
      });
    } catch {
      setError('Не удалось изменить статус ученика.');
    }
  };

  const addSubscription = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const studentId = String(form.get('studentId') ?? '');
    const kind = String(form.get('kind') ?? 'package_4') as Subscription['kind'];
    const paid = form.get('paid') === 'on';
    if (!studentId) {
      setError('Сначала выберите ученика.');
      return;
    }

    const plan = kind === 'package_8'
      ? { total: 8, days: 60 }
      : kind === 'package_4'
        ? { total: 4, days: 30 }
        : { total: 1, days: null };
    const expiresAt = plan.days
      ? Timestamp.fromDate(new Date(Date.now() + plan.days * 86_400_000))
      : null;

    setSubscriptionSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'subscriptions'), {
        studentId,
        kind,
        totalLessons: plan.total,
        remainingLessons: plan.total,
        status: paid ? 'active' : 'pending_payment',
        startsAt: paid ? serverTimestamp() : null,
        paidAt: paid ? serverTimestamp() : null,
        expiresAt,
        createdAt: serverTimestamp(),
      });
      formElement.reset();
    } catch {
      setError('Не удалось создать абонемент.');
    } finally {
      setSubscriptionSaving(false);
    }
  };

  const studentName = (studentId: string) => students.find((item) => item.id === studentId)?.displayName ?? 'Ученик';
  const planName = (kind: Subscription['kind']) => kind === 'package_8' ? '8 занятий' : kind === 'package_4' ? '4 занятия' : 'Разовое занятие';

  const removeSubscription = async (subscription: Subscription) => {
    const name = studentName(subscription.studentId);
    if (!window.confirm(`Удалить абонемент «${planName(subscription.kind)}» ученика ${name}?`)) return;
    setError('');
    try {
      await deleteDoc(doc(db, 'subscriptions', subscription.id));
    } catch {
      setError('Не удалось удалить абонемент.');
    }
  };

  const addLessons = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const studentId = String(form.get('studentId') ?? '');
    const startValue = String(form.get('startAt') ?? '');
    const duration = Number(form.get('duration') ?? 60);
    const repeatCount = Number(form.get('repeatCount') ?? 1);
    const lessonType = String(form.get('lessonType') ?? 'individual') as Lesson['lessonType'];
    if (!studentId || !startValue) {
      setError('Выберите ученика, дату и время урока.');
      return;
    }

    const firstStart = new Date(startValue);
    const seriesId = repeatCount > 1 ? crypto.randomUUID() : null;
    setLessonSaving(true);
    setError('');
    try {
      const batch = writeBatch(db);
      for (let index = 0; index < repeatCount; index += 1) {
        const startAt = new Date(firstStart);
        startAt.setDate(startAt.getDate() + index * 7);
        const endAt = new Date(startAt.getTime() + duration * 60_000);
        const lessonRef = doc(collection(db, 'lessons'));
        batch.set(lessonRef, {
          studentId,
          lessonType,
          startAt: Timestamp.fromDate(startAt),
          endAt: Timestamp.fromDate(endAt),
          seriesId,
          status: 'confirmed',
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      formElement.reset();
    } catch {
      setError('Не удалось добавить урок в расписание.');
    } finally {
      setLessonSaving(false);
    }
  };

  const removeLesson = async (lesson: Lesson, mode: 'one' | 'future' | 'series') => {
    if (mode === 'one' || !lesson.seriesId) {
      await deleteDoc(doc(db, 'lessons', lesson.id));
      return;
    }
    const snapshot = await getDocs(query(collection(db, 'lessons'), where('seriesId', '==', lesson.seriesId)));
    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => {
      const itemLesson = item.data() as Lesson;
      if (mode === 'series' || itemLesson.startAt.toMillis() >= lesson.startAt.toMillis()) batch.delete(item.ref);
    });
    await batch.commit();
  };

  const completeLesson = async (lesson: Lesson) => {
    setError('');
    try {
      const newAttachment = lessonAttachmentUrl.trim()
        ? [{ name: lessonAttachmentName.trim() || 'Материал к домашнему заданию', url: lessonAttachmentUrl.trim() }]
        : [];
      const homeworkAttachments = [...(lesson.homeworkAttachments ?? []), ...newAttachment];
      if (lesson.status === 'completed') {
        await updateDoc(doc(db, 'lessons', lesson.id), {
          teacherComment: lessonComment.trim(),
          materials: lessonMaterials.trim(),
          homework: lessonHomework.trim(),
          homeworkAttachments,
          lessonDetailsUpdatedAt: serverTimestamp(),
        });
        setCompletingLessonId(null);
        setLessonComment('');
        setLessonMaterials('');
        setLessonHomework('');
        setLessonAttachmentName('');
        setLessonAttachmentUrl('');
        return;
      }
      const activeSubscription = subscriptions.find((item) => item.studentId === lesson.studentId && item.status === 'active' && item.remainingLessons > 0);
      const batch = writeBatch(db);
      batch.update(doc(db, 'lessons', lesson.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
        teacherComment: lessonComment.trim(),
        materials: lessonMaterials.trim(),
        homework: lessonHomework.trim(),
        homeworkAttachments,
      });
      if (activeSubscription) {
        batch.update(doc(db, 'subscriptions', activeSubscription.id), {
          remainingLessons: activeSubscription.remainingLessons - 1,
        });
      }
      await batch.commit();
      setCompletingLessonId(null);
      setLessonComment('');
      setLessonMaterials('');
      setLessonHomework('');
      setLessonAttachmentName('');
      setLessonAttachmentUrl('');
    } catch {
      setError(lesson.status === 'completed' ? 'Не удалось сохранить данные урока.' : 'Не удалось отметить урок проведённым.');
    }
  };

  const openLessonDetails = (lesson: Lesson) => {
    setCompletingLessonId(lesson.id);
    setLessonComment(lesson.teacherComment ?? '');
    setLessonMaterials(lesson.materials ?? '');
    setLessonHomework(lesson.homework ?? '');
    setLessonAttachmentName('');
    setLessonAttachmentUrl('');
  };

  const cancelLesson = async (lesson: Lesson) => {
    if (!window.confirm(`Отменить урок ученика ${studentName(lesson.studentId)}?`)) return;
    setError('');
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), { status: 'cancelled', cancelledAt: serverTimestamp() });
    } catch {
      setError('Не удалось отменить урок.');
    }
  };

  const moveLesson = async (lesson: Lesson) => {
    if (!moveDateTime) {
      setError('Выберите новую дату и время.');
      return;
    }
    const newStart = new Date(moveDateTime);
    const duration = lesson.endAt.toMillis() - lesson.startAt.toMillis();
    setError('');
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        startAt: Timestamp.fromDate(newStart),
        endAt: Timestamp.fromDate(new Date(newStart.getTime() + duration)),
        status: 'confirmed',
        movedAt: serverTimestamp(),
      });
      setMovingLessonId(null);
      setMoveDateTime('');
    } catch {
      setError('Не удалось перенести урок.');
    }
  };

  return (
    <div className="admin-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Teaching & Joy</span><h2 id="admin-title">Ученики</h2></div>
          <button aria-label="Закрыть админку" onClick={onClose}><X /></button>
        </header>

        <div className="admin-content">
          <form className="student-form" onSubmit={addStudent}>
            <h3><Plus size={18} /> Новый ученик</h3>
            <label>Имя ученика<input name="displayName" required maxLength={80} placeholder="Например, Анна" /></label>
            <label>Email ученика или родителя<input name="contactEmail" type="email" placeholder="Необязательно" /></label>
            <label>Заметка<textarea name="notes" rows={3} maxLength={500} placeholder="Уровень, учебные цели…" /></label>
            <button className="admin-primary" disabled={saving}>{saving ? 'Сохраняем…' : 'Добавить ученика'}</button>
          </form>

          <form className="student-form subscription-form" onSubmit={addSubscription}>
            <h3>Новый абонемент</h3>
            <label>Ученик
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Выберите ученика</option>
                {students.filter((item) => item.status === 'active').map((student) => <option value={student.id} key={student.id}>{student.displayName}</option>)}
              </select>
            </label>
            <label>Тип
              <select name="kind" defaultValue="package_4">
                <option value="package_4">4 занятия · 30 дней</option>
                <option value="package_8">8 занятий · 60 дней</option>
                <option value="single">Разовое занятие</option>
              </select>
            </label>
            <label className="paid-check"><input name="paid" type="checkbox" /> Оплата получена</label>
            <button className="admin-primary" disabled={subscriptionSaving || students.length === 0}>{subscriptionSaving ? 'Сохраняем…' : 'Создать абонемент'}</button>
          </form>

          <form className="student-form lesson-form" onSubmit={addLessons}>
            <h3><CalendarPlus size={19} /> Новый урок</h3>
            <label>Ученик
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Выберите ученика</option>
                {students.filter((item) => item.status === 'active').map((student) => <option value={student.id} key={student.id}>{student.displayName}</option>)}
              </select>
            </label>
            <label>Формат
              <select name="lessonType" defaultValue="individual"><option value="individual">Индивидуальное</option><option value="group">Групповое</option></select>
            </label>
            <label>Дата и время по МСК<input name="startAt" type="datetime-local" required /></label>
            <label>Продолжительность
              <select name="duration" defaultValue="60"><option value="45">45 минут</option><option value="50">50 минут</option><option value="60">60 минут</option></select>
            </label>
            <label>Повторение по неделям
              <select name="repeatCount" defaultValue="1"><option value="1">Разово</option><option value="2">2 недели</option><option value="4">4 недели</option><option value="8">8 недель</option><option value="12">12 недель</option></select>
            </label>
            <button className="admin-primary" disabled={lessonSaving}>{lessonSaving ? 'Добавляем…' : 'Добавить в расписание'}</button>
          </form>

          <section className="student-list">
            <div className="list-heading"><h3>Все ученики</h3><span>{students.filter((item) => item.status === 'active').length} активных</span></div>
            {error && <p className="admin-error">{error}</p>}
            {loading && <p className="empty-state">Загружаем учеников…</p>}
            {!loading && students.length === 0 && <p className="empty-state">Здесь появятся добавленные ученики.</p>}
            {students.map((student) => (
              <article className={student.status === 'archived' ? 'student archived' : 'student'} key={student.id}>
                <span className="student-icon"><UserRound /></span>
                <div><strong>{student.displayName}</strong><small>{student.contactEmail || 'Контакт не указан'}</small>{student.notes && <p>{student.notes}</p>}</div>
                <button title={student.status === 'active' ? 'Архивировать' : 'Вернуть'} onClick={() => void archiveStudent(student)}><Archive size={17} /></button>
              </article>
            ))}

            <div className="list-heading subscriptions-heading"><h3>Абонементы</h3><span>{subscriptions.filter((item) => item.status === 'active').length} активных</span></div>
            {subscriptions.length === 0 && <p className="empty-state compact">Абонементов пока нет.</p>}
            {subscriptions.map((subscription) => (
              <article className="subscription-row" key={subscription.id}>
                <div><strong>{studentName(subscription.studentId)}</strong><span>{planName(subscription.kind)}</span></div>
                <div className="credit-count"><b>{subscription.remainingLessons}</b><small>из {subscription.totalLessons}</small></div>
                <span className={`payment-status ${subscription.status}`}>{subscription.status === 'active' ? 'Оплачено' : 'Не оплачено'}</span>
                <small>{subscription.expiresAt ? `до ${subscription.expiresAt.toDate().toLocaleDateString('ru-RU')}` : 'без срока'}</small>
                <button className="delete-subscription" title="Удалить абонемент" aria-label={`Удалить абонемент ученика ${studentName(subscription.studentId)}`} onClick={() => void removeSubscription(subscription)}><Trash2 size={16} /></button>
              </article>
            ))}

            <div className="list-heading subscriptions-heading"><h3>Расписание</h3><span>{lessons.length} занятий</span></div>
            {lessons.length === 0 && <p className="empty-state compact">Уроков пока нет.</p>}
            {lessons.map((lesson) => (
              <article className={`lesson-admin-row ${lesson.status}`} key={lesson.id}>
                <div><strong>{studentName(lesson.studentId)}</strong><span>{lesson.lessonType === 'group' ? 'Групповое' : 'Индивидуальное'}{lesson.seriesId ? ' · еженедельно' : ''} · {lesson.status === 'completed' ? 'проведён' : lesson.status === 'cancelled' ? 'отменён' : 'подтверждён'}</span></div>
                <time>{lesson.startAt.toDate().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                {movingLessonId === lesson.id && <div className="move-lesson-form"><input type="datetime-local" value={moveDateTime} onChange={(event) => setMoveDateTime(event.target.value)} /><button onClick={() => void moveLesson(lesson)}>Сохранить</button><button onClick={() => setMovingLessonId(null)}>Отмена</button></div>}
                {completingLessonId === lesson.id && (
                  <div className="complete-lesson-form">
                    <h4>{lesson.status === 'completed' ? 'Редактирование итогов урока' : 'Итоги урока'}</h4>
                    <label>Комментарий после урока<textarea rows={3} value={lessonComment} onChange={(event) => setLessonComment(event.target.value)} placeholder="Тема урока и как он прошёл…" /></label>
                    <label>Материалы урока<textarea rows={2} value={lessonMaterials} onChange={(event) => setLessonMaterials(event.target.value)} placeholder="Ссылки, учебник, страницы, файлы…" /></label>
                    <label>Домашнее задание<textarea rows={3} value={lessonHomework} onChange={(event) => setLessonHomework(event.target.value)} placeholder="Что выполнить к следующему занятию…" /></label>
                    {lesson.homeworkAttachments && lesson.homeworkAttachments.length > 0 && <div className="homework-files"><strong>Уже прикреплено</strong>{lesson.homeworkAttachments.map((file, index) => <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}>📎 {file.name}</a>)}</div>}
                    <fieldset className="file-picker"><legend>Прикрепить материал по ссылке</legend><input type="text" value={lessonAttachmentName} onChange={(event) => setLessonAttachmentName(event.target.value)} placeholder="Название файла или материала" /><input type="url" value={lessonAttachmentUrl} onChange={(event) => setLessonAttachmentUrl(event.target.value)} placeholder="https://drive.google.com/…" /><small>Подойдёт ссылка с Google Диска, Яндекс Диска или другого облака.</small></fieldset>
                    <div><button onClick={() => void completeLesson(lesson)}>{lesson.status === 'completed' ? 'Сохранить изменения' : 'Сохранить и отметить проведённым'}</button><button className="secondary" onClick={() => setCompletingLessonId(null)}>Закрыть</button></div>
                  </div>
                )}
                <div className="lesson-status-actions">
                  <button onClick={() => openLessonDetails(lesson)}><CalendarCheck size={15} /> {lesson.status === 'completed' ? 'Изменить итоги' : 'Проведён'}</button>
                  <button onClick={() => { setMovingLessonId(lesson.id); setMoveDateTime(''); }}><MoveRight size={15} /> Перенести</button>
                  <button disabled={lesson.status === 'cancelled'} onClick={() => void cancelLesson(lesson)}><CalendarX size={15} /> Отменить</button>
                </div>
                <div className="lesson-delete-actions">
                  <button title="Удалить только этот урок" onClick={() => void removeLesson(lesson, 'one')}><Trash2 size={15} /> Один</button>
                  {lesson.seriesId && <button title="Удалить этот и последующие" onClick={() => void removeLesson(lesson, 'future')}>Этот и далее</button>}
                  {lesson.seriesId && <button title="Удалить всю серию" onClick={() => void removeLesson(lesson, 'series')}>Всю серию</button>}
                </div>
              </article>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
