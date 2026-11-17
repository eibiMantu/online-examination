const {load,SEED}=require('./harness');
const ok=(condition,message)=>{if(!condition)throw new Error(message);console.log(`  ✅ ${message}`)};

console.log('=== STUDENT RECURRING SUBJECT SCHEDULE ===');
const seed=SEED();
seed.studentEnrollments=[{studentId:'S1',subjectCode:'SUB1',sectionId:'A',offeringId:'OA1'}];
seed.sectionSubjects=[{sectionId:'A',assignments:[{id:'OA1',subjectCode:'SUB1',facultyId:'F1',schedule:{days:['Saturday'],start:'13:00',end:'14:00',room:'Room 101'}}]}];
const page=load('student.html',{...seed,currentUser:{username:'S1',role:'student'}});

const saturdayCells=[...page.d.querySelectorAll('#scheduleCalendar .schedule-calendar-day')].filter(cell=>cell.querySelector('.schedule-subject-chip'));
ok(saturdayCells.length>=4,'the subject appears on every Saturday in the displayed month');
ok(saturdayCells.every(cell=>/SUB1/.test(cell.textContent)),'each recurring calendar cell names the subject');
ok(saturdayCells.every(cell=>cell.querySelector('.schedule-subject-chip')?.getAttribute('style')?.includes('--chip-color')),'the subject label uses its stable subject color');
ok(!page.d.querySelector('.schedule-event-dots'),'redundant event dots are not rendered');
ok(!page.d.querySelector('#examCalendar .compact-calendar-day.has-events'),'recurring classes do not create events in the Dashboard examination calendar');
saturdayCells[0].click();
const agenda=page.d.getElementById('scheduleDayAgenda');
ok(/1:00 PM/.test(agenda.textContent)&&/2:00 PM/.test(agenda.textContent),'the selected day shows the general class time');
ok(/Repeats every Saturday/.test(agenda.textContent)&&/Room 101/.test(agenda.textContent),'the agenda identifies the weekly recurrence and room');
ok(!!agenda.querySelector('.class-meeting'),'the recurring subject is distinct from an examination event');
ok(!page.d.getElementById('selectedDayAgenda').querySelector('.class-meeting'),'the Dashboard selected-day panel remains examination-only');
page.w.close();
