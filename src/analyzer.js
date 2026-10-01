/**
 * Deterministic Academic Analyzer
 * Enforces IITU 20% retake threshold based on actual Platonus sessions & emits discrete change events.
 */

const config = require('./config');

const DAY_NAMES = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  0: 'Воскресенье'
};

class AcademicAnalyzer {
  constructor(scheduleData, journalData, subjectDetailsMap, previousState = null) {
    this.scheduleData = scheduleData || {};
    this.journalData = journalData || [];
    this.subjectDetailsMap = subjectDetailsMap || {};
    this.previousState = previousState;
    this.hourMap = this._buildHourMap();
  }

  _buildHourMap() {
    const map = {};
    const hours = this.scheduleData.lessonHours || [];
    for (const h of hours) {
      map[h.number] = {
        start: h.start ? h.start.slice(0, 5) : '00:00',
        finish: h.finish ? h.finish.slice(0, 5) : '00:00',
        label: `${h.start ? h.start.slice(0, 5) : ''}-${h.finish ? h.finish.slice(0, 5) : ''}`,
        shift: h.shiftNumber,
        duration: h.duration
      };
    }
    return map;
  }

  getWeeklySchedule() {
    const timetable = this.scheduleData.timetable || {};
    const days = timetable.days || {};
    const weekly = {};

    for (let d = 1; d <= 6; d++) {
      const dayName = DAY_NAMES[d];
      weekly[dayName] = [];
      const dayObj = days[String(d)];
      if (!dayObj || !dayObj.lessons) continue;

      for (const [hourNumber, hourSlot] of Object.entries(dayObj.lessons)) {
        if (!hourSlot.lessons || hourSlot.lessons.length === 0) continue;
        const timeInfo = this.hourMap[hourNumber] || { label: hourNumber, start: '00:00', finish: '00:00' };

        for (const l of hourSlot.lessons) {
          weekly[dayName].push({
            hourNumber: parseInt(hourNumber),
            startTime: timeInfo.start,
            endTime: timeInfo.finish,
            timeLabel: timeInfo.label,
            subject: l.subjectName,
            type: l.groupTypeShortName || l.groupTypeFullName || 'Занятие',
            typeFull: l.groupTypeFullName || l.groupTypeShortName || 'Занятие',
            tutor: l.tutorShortName || l.tutorName || '',
            auditory: l.auditory || '',
            building: (l.building || '').trim(),
            roomLabel: `${(l.building || '').trim()} ${l.auditory || ''}`.trim(),
            isOnline: Boolean(l.onlineClass || (l.building && l.building.toLowerCase().includes('онлайн'))),
            studyGroupId: l.studyGroupID
          });
        }
      }

      weekly[dayName].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return weekly;
  }

  /**
   * Count actual planned weekly sessions for each subject
   */
  getPlannedWeeklySessions() {
    const weekly = this.getWeeklySchedule();
    const counts = {};
    for (const dayLessons of Object.values(weekly)) {
      for (const l of dayLessons) {
        counts[l.subject] = (counts[l.subject] || 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Calculate planned total sessions across actual semester weeks
   */
  calculateTotalPlannedSessions(subjectName) {
    const weeklyCounts = this.getPlannedWeeklySessions();
    const sessionsPerWeek = weeklyCounts[subjectName] || 3;
    const totalWeeks = (this.scheduleData.weekList && this.scheduleData.weekList.length > 0)
      ? this.scheduleData.weekList.length
      : 15;
    return sessionsPerWeek * totalWeeks;
  }

  analyze() {
    const attendanceList = [];
    const events = [];

    for (const item of this.journalData) {
      const subjectName = (item.subjectName || item.SubjectName || '').replace(/\([^)]+\)$/, '').trim();
      const subjectId = item.subjectID || item.SubjectID;
      const groups = this.subjectDetailsMap[subjectId] || [];

      let missedSessions = 0;
      let attendedSessions = 0;
      const gradesList = [];
      const lessonRecords = [];

      for (const group of groups) {
        const marksObj = group.Marks || {};
        for (const [monthKey, dayMap] of Object.entries(marksObj)) {
          if (!dayMap || !dayMap.Marks) continue;
          for (const [dayKey, markList] of Object.entries(dayMap.Marks)) {
            if (!Array.isArray(markList)) continue;
            for (const m of markList) {
              const isAbsence = m.Mark === -1 || m.MarkName === 'НБ' || (m.Comment && m.Comment.includes('НБ'));
              const dateStr = m.MarkDate?.DisplayedValue || `${dayKey}-${monthKey}-${config.ACADEMIC.SEMESTER_YEAR}`;

              if (isAbsence) {
                missedSessions++;
                lessonRecords.push({ date: dateStr, status: 'НБ', mark: -1, group: group.Name });
              } else if (m.Mark >= 0) {
                attendedSessions++;
                gradesList.push(m.Mark);
                lessonRecords.push({ date: dateStr, status: 'БЫЛ', mark: m.Mark, group: group.Name });
              }
            }
          }
        }
      }

      const heldSessions = missedSessions + attendedSessions;
      const plannedSessions = this.calculateTotalPlannedSessions(subjectName);
      const currentAbsencePct = heldSessions > 0 ? (missedSessions / heldSessions) * 100 : 0;
      const maxAllowedAbsences = Math.floor(plannedSessions * config.ACADEMIC.RETAKE_THRESHOLD);
      const remainingAllowed = Math.max(0, maxAllowedAbsences - missedSessions);

      const avgGrade = gradesList.length > 0
        ? parseFloat((gradesList.reduce((sum, g) => sum + g, 0) / gradesList.length).toFixed(1))
        : null;

      // Risk level assessment
      let riskLevel = 'SAFE'; // SAFE | WARNING | DANGER
      let statusLabel = '🟢 Норма';

      if (missedSessions >= maxAllowedAbsences || (heldSessions >= 5 && currentAbsencePct >= 20.0)) {
        riskLevel = 'DANGER';
        statusLabel = '🚨 РЕТЕЙК';
        events.push({
          type: 'RETAKE_DANGER',
          subject: subjectName,
          missed: missedSessions,
          held: heldSessions,
          maxAllowed: maxAllowedAbsences,
          pct: parseFloat(currentAbsencePct.toFixed(1))
        });
      } else if (remainingAllowed <= config.ACADEMIC.MIN_REMAINING_WARNING || (heldSessions >= 3 && currentAbsencePct >= 10.0)) {
        riskLevel = 'WARNING';
        statusLabel = '⚠️ Внимание';
      }

      attendanceList.push({
        subjectName,
        subjectId,
        tutor: item.tutorList || item.TutorFullName || '',
        plannedSessions,
        heldSessions,
        missedSessions,
        attendedSessions,
        currentAbsencePct: parseFloat(currentAbsencePct.toFixed(1)),
        maxAllowedAbsences,
        remainingAllowed,
        avgGrade,
        gradesList,
        riskLevel,
        statusLabel,
        lessonRecords
      });
    }

    return {
      attendanceList,
      events,
      weeklySchedule: this.getWeeklySchedule()
    };
  }

  getLessonsForDate(date) {
    const dayOfWeek = date.getDay();
    const dayName = DAY_NAMES[dayOfWeek];
    if (!dayName || dayOfWeek === 0) return [];
    const weekly = this.getWeeklySchedule();
    return weekly[dayName] || [];
  }
}

module.exports = { AcademicAnalyzer, DAY_NAMES };
