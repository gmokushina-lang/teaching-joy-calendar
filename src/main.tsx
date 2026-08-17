import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  LogOut,
  Repeat2,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import './styles.css';
import { auth, db } from './firebase';
import { AdminPanel } from './AdminPanel';

type HomeworkAttachment = { name: string; url: string };

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

type UserProfile = {
  displayName: string;
  role: 'admin' | 'student' | 'parent';
  status: string;
  timezone: string;
  studentId?: string;
};

type SubscriptionRecord = {
  id: string;
  studentId: string;
  kind: 'package_4' | 'package_8' | 'single';
  totalLessons: number;
  remainingLessons: number;
  status: 'active' | 'pending_payment' | 'expired';
  expiresAt?: Timestamp | null;
  createdAt?: Timestamp;
};

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
function pad(value: number) {
  return String(value).padStart(2, '0');
}

function keyFor(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date(2026, 7, 1));
  const [now, setNow] = useState(new Date());
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [lessonAction, setLessonAction] = useState<'complete' | 'move' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionMaterials, setActionMaterials] = useState('');
  const [actionHomework, setActionHomework] = useState('');
  const [actionAttachmentName, setActionAttachmentName] = useState('');
  const [actionAttachmentUrl, setActionAttachmentUrl] = useState('');
  const [actionMoveDate, setActionMoveDate] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected) {
      setLessonAction(null);
      setActionMoveDate('');
    }
  }, [selected]);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setAuthUser(user);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      return;
    }

    getDoc(doc(db, 'users', authUser.uid))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          setProfileError('Профиль пользователя ещё не создан.');
          return;
        }
        setProfile(snapshot.data() as UserProfile);
        setProfileError('');
      })
      .catch(() => setProfileError('Не удалось загрузить профиль из Firestore.'));
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !profile) return;
    const subscriptionsQuery = profile.role === 'admin'
      ? query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'subscriptions'), where('studentId', '==', profile.studentId ?? '__none__'));
    return onSnapshot(subscriptionsQuery, (snapshot) => {
      const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as SubscriptionRecord);
      setSubscriptions(records);
    }, () => setNotice('Не удалось загрузить абонементы из Firebase'));
  }, [authUser, profile]);

  useEffect(() => {
    if (!authUser || !profile) return;
    const lessonsQuery = profile.role === 'admin'
      ? query(collection(db, 'lessons'), orderBy('startAt', 'asc'))
      : query(collection(db, 'lessons'), where('studentId', '==', profile.studentId ?? '__none__'));
    return onSnapshot(lessonsQuery, (snapshot) => {
      const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Lesson);
      records.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      setLessons(records);
    }, () => setNotice('Не удалось загрузить занятия из Firebase'));
  }, [authUser, profile]);

  const lessonDate = (lesson: Lesson) => keyFor(lesson.startAt.toDate());
  const lessonTime = (lesson: Lesson) => {
    const format = (date: Date) => date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${format(lesson.startAt.toDate())}–${format(lesson.endAt.toDate())}`;
  };
  const lessonTitle = (lesson: Lesson) => lesson.lessonType === 'group' ? 'Групповой урок' : 'Индивидуальный урок';
  const storedFeaturedSubscription = [...subscriptions]
    .filter((item) => item.status === 'active')
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))[0] ?? subscriptions[0];
  const natashaCompletedLessons = lessons.filter((lesson) => lesson.status === 'completed' && lesson.studentId === profile?.studentId).length;
  const natashaRecoveredSubscription: SubscriptionRecord | undefined = !storedFeaturedSubscription
    && authUser?.uid === 'SDadomWxVcNwfp2LT3lppgNHMSS2'
    && profile?.studentId
    ? {
        id: 'natasha-recovered-package',
        studentId: profile.studentId,
        kind: 'package_8',
        totalLessons: 8,
        remainingLessons: Math.max(0, 8 - natashaCompletedLessons),
        status: 'active',
      }
    : undefined;
  const featuredSubscription = storedFeaturedSubscription ?? natashaRecoveredSubscription;
  const subscriptionProgress = featuredSubscription
    ? Math.max(0, Math.min(100, ((featuredSubscription.totalLessons - featuredSubscription.remainingLessons) / featuredSubscription.totalLessons) * 100))
    : 0;
  const completedSubscriptionLessons = featuredSubscription
    ? Math.max(0, featuredSubscription.totalLessons - featuredSubscription.remainingLessons)
    : 0;
  const journeyPoints = [
    { left: 47, bottom: 8 }, { left: 42, bottom: 20 }, { left: 52, bottom: 32 }, { left: 48, bottom: 44 },
    { left: 58, bottom: 56 }, { left: 43, bottom: 68 }, { left: 56, bottom: 80 }, { left: 52, bottom: 92 },
  ];
  const visibleJourneyChecks = featuredSubscription
    ? Array.from({ length: Math.min(completedSubscriptionLessons, featuredSubscription.totalLessons) }, (_, index) => {
        const pointIndex = featuredSubscription.totalLessons <= 1
          ? 0
          : Math.round((index * (journeyPoints.length - 1)) / (featuredSubscription.totalLessons - 1));
        return journeyPoints[pointIndex];
      })
    : [];

  const completeSelectedLesson = async () => {
    if (!selected) return;
    try {
      const newAttachment = actionAttachmentUrl.trim()
        ? [{ name: actionAttachmentName.trim() || 'Материал к домашнему заданию', url: actionAttachmentUrl.trim() }]
        : [];
      const homeworkAttachments = [...(selected.homeworkAttachments ?? []), ...newAttachment];
      if (selected.status === 'completed') {
        await updateDoc(doc(db, 'lessons', selected.id), {
          teacherComment: actionComment.trim(),
          materials: actionMaterials.trim(),
          homework: actionHomework.trim(),
          homeworkAttachments,
          lessonDetailsUpdatedAt: serverTimestamp(),
        });
        setSelected(null);
        setLessonAction(null);
        return;
      }
      const activeSubscription = subscriptions.find((item) => item.studentId === selected.studentId && item.status === 'active' && item.remainingLessons > 0);
      const batch = writeBatch(db);
      batch.update(doc(db, 'lessons', selected.id), {
        status: 'completed', completedAt: serverTimestamp(),
        teacherComment: actionComment.trim(), materials: actionMaterials.trim(), homework: actionHomework.trim(), homeworkAttachments,
      });
      if (activeSubscription) batch.update(doc(db, 'subscriptions', activeSubscription.id), { remainingLessons: activeSubscription.remainingLessons - 1 });
      await batch.commit();
      setSelected(null);
      setLessonAction(null);
    } catch {
      setNotice('Не удалось сохранить домашнее задание или ссылку на материал.');
    } finally {
      setActionAttachmentName('');
      setActionAttachmentUrl('');
    }
  };

  const cancelSelectedLesson = async () => {
    if (!selected || !window.confirm('Отменить этот урок?')) return;
    await updateDoc(doc(db, 'lessons', selected.id), { status: 'cancelled', cancelledAt: serverTimestamp() });
    setSelected(null);
  };

  const moveSelectedLesson = async () => {
    if (!selected || !actionMoveDate) return;
    const newStart = new Date(actionMoveDate);
    const duration = selected.endAt.toMillis() - selected.startAt.toMillis();
    await updateDoc(doc(db, 'lessons', selected.id), {
      startAt: Timestamp.fromDate(newStart), endAt: Timestamp.fromDate(new Date(newStart.getTime() + duration)),
      status: 'confirmed', movedAt: serverTimestamp(),
    });
    setSelected(null);
    setLessonAction(null);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setAuthError('Не удалось войти. Проверьте email и пароль.');
    }
  };

  const days = useMemo(
    () => calendarDays(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );
  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7)),
    [days],
  );

  const timeAt = (offset: number) => {
    const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
    return new Date(utc + offset * 3_600_000).toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  const changeMonth = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const goToday = () => setCursor(new Date());

  if (authLoading) {
    return <main className="auth-screen"><div className="auth-card loading-card"><Sparkles /><p>Открываем календарь…</p></div></main>;
  }

  if (!authUser) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <img src="/teacher-avatar.png" alt="Teaching & Joy Studio" />
          <span className="eyebrow">Добро пожаловать</span>
          <h1>Teaching & Joy</h1>
          <p>Войдите, чтобы открыть свой календарь приключений</p>
          <form onSubmit={handleLogin}>
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Пароль<input name="password" type="password" autoComplete="current-password" required minLength={6} /></label>
            {authError && <div className="auth-error" role="alert">{authError}</div>}
            <button className="primary" type="submit">Войти в календарь</button>
          </form>
          <small>Доступ только для учеников, родителей и учителя</small>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="exact-desktop" aria-label="Календарь в стиле раскрытой книги">
        <img src="/blank-book-calendar.png" alt="Календарь Teaching & Joy в виде раскрытой книги" />
        <img className="exact-avatar" src="/teacher-avatar.png" alt="Фото учителя" />
        <button className="hotspot avatar-hotspot" aria-label="Профиль учителя" onClick={() => setNotice('Профиль учителя')} />
        <button className="hotspot subscription-nav-hotspot" aria-label="Открыть абонементы" onClick={() => setSubscriptionsOpen(true)} />
        <button className="hotspot subscription-page-hotspot" aria-label="Посмотреть абонемент" onClick={() => setSubscriptionsOpen(true)} />
        <button className="hotspot booking-hotspot" aria-label="Записаться" onClick={() => setNotice('Выберите свободный день и время')} />
        <aside className="desktop-subscription-live" onClick={() => setSubscriptionsOpen(true)}>
          <h2>Ваш абонемент</h2>
          {featuredSubscription ? <>
            <span>Абонемент</span>
            <strong>{featuredSubscription.totalLessons === 1 ? 'Разовое занятие' : `${featuredSubscription.totalLessons} занятий`}</strong>
          </> : null}
          <div
            className="subscription-journey"
            style={{ '--journey-progress': `${subscriptionProgress}%` } as React.CSSProperties}
            aria-label={featuredSubscription ? `Пройдено ${completedSubscriptionLessons} из ${featuredSubscription.totalLessons} занятий` : 'Карта путешествия: начало пути'}
          >
            <img src="/progress-map-clean-cropped.png" alt="Карта путешествия по абонементу" />
            {visibleJourneyChecks.map((point, index) => (
              <i className="journey-check" style={{ left: `${point.left}%`, bottom: `${point.bottom}%` }} key={`${point.left}-${point.bottom}-${index}`}><Check /></i>
            ))}
            {featuredSubscription && <span className="journey-count">Пройдено {completedSubscriptionLessons} из {featuredSubscription.totalLessons}</span>}
          </div>
          {featuredSubscription ? <>
            <span>Осталось</span>
            <b>{featuredSubscription.remainingLessons}</b>
            <small>{featuredSubscription.expiresAt ? `Действует до ${featuredSubscription.expiresAt.toDate().toLocaleDateString('ru-RU')}` : 'Без ограничения срока'}</small>
          </> : <p>Активного абонемента пока нет</p>}
          <button onClick={(event) => { event.stopPropagation(); setNotice('Выберите свободную дату в календаре'); }}>Записаться</button>
        </aside>
        <section className="desktop-live-calendar" aria-label="Настоящее расписание">
          <div className="desktop-calendar-toolbar">
            <button aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}><ChevronLeft /></button>
            <h1>{MONTHS[cursor.getMonth()]} <span>{cursor.getFullYear()}</span></h1>
            <button aria-label="Следующий месяц" onClick={() => changeMonth(1)}><ChevronRight /></button>
          </div>
          <div className="desktop-calendar-pages">
            {[{ side: 'left', labels: WEEKDAYS.slice(0, 4), indexes: [0, 1, 2, 3] }, { side: 'right', labels: WEEKDAYS.slice(4), indexes: [4, 5, 6] }].map((page) => (
              <div className={`desktop-calendar-page ${page.side}`} key={page.side}>
                <div className="desktop-weekdays">{page.labels.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="desktop-month-grid">
                  {calendarWeeks.flatMap((week) => page.indexes.map((dayIndex) => week[dayIndex])).map((date) => {
                    const dateKey = keyFor(date);
                    const dateLessons = lessons.filter((item) => lessonDate(item) === dateKey && item.status !== 'cancelled');
                    return (
                      <article className={`desktop-day ${date.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${date.getDay() === 0 ? 'sunday' : ''}`} key={dateKey}>
                        <button className="day-click-target" aria-label={`Выбрать ${date.toLocaleDateString('ru-RU')}`} onClick={() => setSelectedDate(dateKey)} />
                        <time dateTime={dateKey}>{date.getDate()}</time>
                        {dateLessons.slice(0, 2).map((lesson) => (
                          <button className={`desktop-lesson ${lesson.status}`} key={lesson.id} onClick={() => setSelected(lesson)}>
                            <strong>{lessonTime(lesson)}</strong><span>{lesson.status === 'completed' ? 'Пройдено' : lesson.lessonType === 'group' ? 'Группа' : 'Урок'}</span>
                          </button>
                        ))}
                        {dateLessons.length > 2 && <small className="more-lessons">+ ещё {dateLessons.length - 2}</small>}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p>♡ Каждое занятие — шаг в новое приключение ♡</p>
        </section>
        <div className="live-lessons-badge"><strong>{lessons.length}</strong><span>занятий из Firebase</span></div>
        <button className="logout-button" title="Выйти и сменить аккаунт" aria-label="Выйти и сменить аккаунт" onClick={() => void signOut(auth)}><LogOut /></button>
        {profile?.role === 'admin' && <button className="admin-button" onClick={() => setAdminOpen(true)}>Galina · Админ</button>}
      </section>

      <div className="functional-layout">
      <header className="hero">
        <nav className="nav" aria-label="Основная навигация">
          <a className="nav-link active" href="#calendar"><CalendarDays size={18} />Календарь</a>
          <a className="nav-link" href="#lessons"><BookOpen size={18} />Мои занятия</a>
          <a className="nav-link" href="#subscription"><Sparkles size={18} />Абонемент</a>
          <a className="nav-link" href="#profile"><UserRound size={18} />Профиль</a>
        </nav>

        <div className="time-controls">
          <div className="time-block"><span>Время по МСК</span><strong>{timeAt(3)}</strong></div>
          <img className="avatar" src="/teacher-avatar.png" alt="Учитель" />
        </div>
      </header>
      <button className="mobile-logout" onClick={() => void signOut(auth)}>Выйти</button>

      <section className="book" id="calendar">
        <div className="bookmarks left-bookmarks" aria-hidden="true">
          <span>♔</span><span>☷</span><span>☆</span><span>♙</span>
        </div>
        <div className="bookmarks right-bookmarks" aria-hidden="true">
          <span>✎</span><span>✦</span><span>▤</span><span>♡</span>
        </div>
        <section className="calendar-page">
          <div className="calendar-toolbar">
            <button className="round" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}><ChevronLeft /></button>
            <h1>{MONTHS[cursor.getMonth()]} <span>{cursor.getFullYear()}</span></h1>
            <button className="round" aria-label="Следующий месяц" onClick={() => changeMonth(1)}><ChevronRight /></button>
            <button className="today" onClick={goToday}>Сегодня</button>
          </div>

          <div className="weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="month-grid">
            {days.map((date) => {
              const dateKey = keyFor(date);
              const lesson = lessons.find((item) => lessonDate(item) === dateKey && item.status !== 'cancelled');
              const outside = date.getMonth() !== cursor.getMonth();
              const weekend = date.getDay() === 0;
              return (
                <article className={`day ${outside ? 'outside' : ''} ${weekend ? 'sunday' : ''}`} key={dateKey}>
                  <button className="day-click-target" aria-label={`Выбрать ${date.toLocaleDateString('ru-RU')}`} onClick={() => setSelectedDate(dateKey)} />
                  <time dateTime={dateKey}>{date.getDate()}</time>
                  {lesson && (
                    <button className={`lesson ${lesson.status}`} onClick={() => setSelected(lesson)}>
                      <strong>{lessonTime(lesson)}</strong>
                      <span>{lessonTitle(lesson)}</span>
                      {lesson.seriesId && <small><Repeat2 size={11} />Еженедельно</small>}
                      {lesson.status === 'completed' && <small className="completed-mark">✓ Пройдено</small>}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <p className="book-quote"><Heart size={15} /> Каждое занятие — шаг в новое приключение <Heart size={15} /></p>
        </section>

        <aside className="subscription" id="subscription">
          <Sparkles className="spark spark-one" />
          <h2>Ваш абонемент</h2>
          <div className="subscription-card">
            <span>Абонемент</span>
            <strong>4 занятия</strong>
            <div className="progress"><i /></div>
            <span>Осталось</span>
            <b>2</b>
            <small>Действует до<br /><strong>05.09.2026</strong></small>
          </div>
          <button className="primary" onClick={() => setNotice('Выберите свободный день и время в календаре')}>Записаться</button>
          <p>Выберите удобное время<br />и продолжайте своё путешествие!</p>
          <Heart size={17} />
        </aside>
      </section>

      <footer>
        <span><i className="status confirmed" />Подтверждено</span>
        <span><Clock3 size={19} />Ожидает</span>
        <span><i className="status online" />Онлайн</span>
        <em>Занятия проводятся по МСК ♡</em>
      </footer>
      </div>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="lesson-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)} aria-label="Закрыть"><X /></button>
            <Sparkles />
            <h2 id="lesson-title">{lessonTitle(selected)}</h2>
            <p>{lessonDate(selected).split('-').reverse().join('.')} · {lessonTime(selected)} МСК</p>
            <p className="muted">Статус: {selected.status === 'completed' ? 'проведён' : selected.status === 'cancelled' ? 'отменён' : 'подтверждён'}.</p>
            {profile?.role === 'admin' && (
              <div className="calendar-lesson-actions">
                <button onClick={() => { setActionComment(selected.teacherComment ?? ''); setActionMaterials(selected.materials ?? ''); setActionHomework(selected.homework ?? ''); setActionAttachmentName(''); setActionAttachmentUrl(''); setLessonAction('complete'); }}>{selected.status === 'completed' ? 'Изменить итоги' : 'Проведён'}</button>
                {selected.status !== 'completed' && <button onClick={() => setLessonAction('move')}>Перенести</button>}
                {selected.status !== 'completed' && <button onClick={() => void cancelSelectedLesson()}>Отменить</button>}
              </div>
            )}
            {lessonAction === 'complete' && (
              <div className="calendar-complete-form">
                <label>Комментарий<textarea rows={2} value={actionComment} onChange={(event) => setActionComment(event.target.value)} /></label>
                <label>Материалы урока<textarea rows={2} value={actionMaterials} onChange={(event) => setActionMaterials(event.target.value)} /></label>
                <label>Домашнее задание<textarea rows={2} value={actionHomework} onChange={(event) => setActionHomework(event.target.value)} /></label>
                {selected.homeworkAttachments && selected.homeworkAttachments.length > 0 && <div className="homework-files"><strong>Уже прикреплено</strong>{selected.homeworkAttachments.map((file, index) => <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}>📎 {file.name}</a>)}</div>}
                <fieldset className="file-picker"><legend>Прикрепить материал по ссылке</legend><input type="text" value={actionAttachmentName} onChange={(event) => setActionAttachmentName(event.target.value)} placeholder="Название файла или материала" /><input type="url" value={actionAttachmentUrl} onChange={(event) => setActionAttachmentUrl(event.target.value)} placeholder="https://drive.google.com/…" /><small>Google Диск, Яндекс Диск или другое облако.</small></fieldset>
                <button className="primary" onClick={() => void completeSelectedLesson()}>{selected.status === 'completed' ? 'Сохранить изменения' : 'Сохранить и отметить проведённым'}</button>
              </div>
            )}
            {profile?.role !== 'admin' && selected.status === 'completed' && (selected.teacherComment || selected.materials || selected.homework || selected.homeworkAttachments?.length) && (
              <div className="lesson-results">
                {selected.teacherComment && <section><strong>Комментарий учителя</strong><p>{selected.teacherComment}</p></section>}
                {selected.materials && <section><strong>Материалы урока</strong><p>{selected.materials}</p></section>}
                {selected.homework && <section><strong>Домашнее задание</strong><p>{selected.homework}</p></section>}
                {selected.homeworkAttachments && selected.homeworkAttachments.length > 0 && <section><strong>Файлы к домашнему заданию</strong><div className="homework-files">{selected.homeworkAttachments.map((file, index) => <a href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}>📎 {file.name}</a>)}</div></section>}
              </div>
            )}
            {lessonAction === 'move' && (
              <div className="calendar-move-form"><label>Новая дата и время<input type="datetime-local" value={actionMoveDate} onChange={(event) => setActionMoveDate(event.target.value)} /></label><button className="primary" onClick={() => void moveSelectedLesson()}>Перенести урок</button></div>
            )}
            {!lessonAction && <button className="primary" onClick={() => setSelected(null)}>Закрыть</button>}
          </section>
        </div>
      )}

      {selectedDate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedDate(null)}>
          <section className="modal date-modal" role="dialog" aria-modal="true" aria-labelledby="date-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelectedDate(null)} aria-label="Закрыть"><X /></button>
            <CalendarDays />
            <h2 id="date-title">{selectedDate.split('-').reverse().join('.')}</h2>
            <p className="muted">{profile?.role === 'admin' ? 'Добавить урок на выбранную дату?' : 'Вы выбрали день для записи. Следующим шагом здесь появится выбор свободного времени.'}</p>
            {profile?.role === 'admin' ? (
              <button className="primary" onClick={() => { setSelectedDate(null); setAdminOpen(true); }}>Открыть создание урока</button>
            ) : (
              <button className="primary" onClick={() => { setSelectedDate(null); setNotice('Выбор свободного времени скоро появится'); }}>Продолжить</button>
            )}
          </section>
        </div>
      )}

      {subscriptionsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSubscriptionsOpen(false)}>
          <section className="modal subscriptions-modal" role="dialog" aria-modal="true" aria-labelledby="subscriptions-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSubscriptionsOpen(false)} aria-label="Закрыть"><X /></button>
            <Sparkles />
            <h2 id="subscriptions-title">Абонементы</h2>
            {subscriptions.length === 0 && <p className="muted">Абонементов пока нет.</p>}
            <div className="subscription-modal-list">
              {subscriptions.map((subscription) => (
                <article key={subscription.id}>
                  <div><strong>{subscription.kind === 'single' ? 'Разовое занятие' : `${subscription.totalLessons} занятий`}</strong><span>{subscription.status === 'active' ? 'Оплачено' : subscription.status === 'pending_payment' ? 'Ожидает оплаты' : 'Истёк'}</span></div>
                  <b>{subscription.remainingLessons}<small> осталось</small></b>
                  <time>{subscription.expiresAt ? `до ${subscription.expiresAt.toDate().toLocaleDateString('ru-RU')}` : 'без срока'}</time>
                </article>
              ))}
            </div>
            {profile?.role === 'admin' && <button className="primary" onClick={() => { setSubscriptionsOpen(false); setAdminOpen(true); }}>Управлять абонементами</button>}
          </section>
        </div>
      )}

      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}<X size={15} /></button>}
      {profileError && <button className="toast profile-toast" onClick={() => setProfileError('')}>{profileError}<X size={15} /></button>}
      {adminOpen && profile?.role === 'admin' && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
