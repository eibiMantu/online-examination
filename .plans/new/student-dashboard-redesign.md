# Student Dashboard Redesign Notes

Status: **Design notes only — no dashboard implementation has started.**

These notes translate the six supplied references into an implementation-ready direction for the existing Student Dashboard in `html/student.html`.

## 1. Overall page layout (Image 1)

- Redesign the Student Dashboard as a three-column desktop shell:
  1. persistent left sidebar;
  2. main dashboard content;
  3. right calendar/schedule rail.
- Keep the existing student identity and welcome information, but present it in the new layout rather than as the current full-width welcome banner.
- The main content area contains the status summary, progress graph, and class cards.
- The right rail contains the compact monthly calendar above the selected-day detailed schedule.
- Cards use generous rounded corners, soft shadows, and clear spacing similar to Image 1, without copying its pink palette.

## 2. Sidebar

- Preserve the same sidebar layout across Student pages: student identity at the top, icon-and-label navigation in the middle, and account/logout controls at the bottom.
- Use the Student Dashboard's real navigation content rather than the sample labels from Image 1.
- Proposed navigation order:
  - Dashboard (renamed from Overview)
  - My Examinations
  - My Results
  - My Subjects
  - Schedule (new dedicated destination)
- The existing page content remains reachable; this redesign must not remove examination, results, subject, subject-detail, or review flows.
- The new Schedule tab owns the expanded schedule experience. The Dashboard right rail remains a compact view of the same schedule data.
- Active, hover, focus, and selected states use the dark-green/orange theme and remain keyboard accessible.

## 3. Status summary cards (Image 2)

- Replace the current `Enrolled Subjects`, `Scheduled Exams`, and `Exams Completed` dashboard cards with:
  - **Done** — examinations the student has submitted/completed.
  - **Missed** — examinations whose submission window ended with no completed submission and no remaining valid attempt.
  - **To do** — available or upcoming examinations that still require the student's action.
- Each card shows a count and a circular percentage/progress indicator.
- Card percentages use the same denominator: `Done + Missed + To do` for the selected reporting period.
- If the denominator is zero, show `0%` rather than an undefined value.
- Clicking a status card filters or opens the relevant examination list; it must not be decorative-only.
- Use consistent category colors throughout cards, graph, calendar markers, filters, and legends:
  - Done: green family
  - Missed: orange/red-orange family
  - To do: light orange/gold family

## 4. Progress graph

- Replace the sample Grammar/Listening/Speaking graph with a graph based on the real **Done, Missed, and To do** values.
- The three series use the exact same rules as the status cards so totals cannot disagree.
- Default time grouping: weekly buckets for the active academic period; labels and tooltip values show the bucket and exact count.
- Include a visible legend and accessible text summary; do not rely on color alone.
- Empty state: explain that no examinations fall inside the selected period instead of rendering a misleading flat graph.
- The graph responds to the same reporting-period/filter control as the summary cards if a period selector is added.

## 5. Synced calendars and Schedule tab (Image 3)

- Treat the compact month calendar and the detailed agenda as two views of one selected date and one schedule data source.
- Selecting a day in the upper calendar must immediately update the detailed view below it.
- The selected day remains visibly highlighted; today has a separate visual treatment.
- Month navigation preserves the selected date when possible. If the selected date is outside the newly displayed month, select a clear default (today when visible, otherwise the first relevant day).
- Days containing examinations or class meetings show small status/event markers using the shared theme colors.
- The detailed day view shows events in chronological order with:
  - start and end time;
  - examination or class title;
  - subject/class code;
  - status (Done, Missed, or To do where applicable);
  - relevant action, such as opening an available examination or class.
- Empty day state: `No classes or examinations scheduled for this day.`
- The Dashboard uses the compact stacked calendar shown in Image 3. The new Schedule tab provides the expanded calendar/agenda view while staying synchronized with the Dashboard selection during the session.
- Existing always-open examinations must remain discoverable in the Schedule experience even though they have no calendar date.

## 6. Class cells (Images 4 and 5)

- Remove the Achievement section/pattern represented by Image 4.
- Replace it with a horizontally scrollable or responsive **My Classes** section based on Image 5.
- Each class cell represents a real enrolled subject and shows:
  - subject/class name;
  - subject code and section;
  - assigned instructor;
  - an illustration or subject icon;
  - a clear affordance to open the existing subject-detail page.
- Do not include the sample `Add Class` tile unless a real student enrollment/request action is explicitly supported. Students must not receive an unauthorized class-creation control.
- On smaller screens, class cells become a swipeable row or a single-column list without clipping text or controls.

## 7. Theme and color system (Image 6)

- Use Image 6 as the visual direction: deep forest green, dark teal-green, muted teal, burnt orange, and light peach/orange accents.
- Proposed starting tokens (to be visually tuned during implementation):
  - `--student-green-950: #062f2b`
  - `--student-green-800: #0b4a43`
  - `--student-teal-600: #4f8988`
  - `--student-orange-700: #b9571d`
  - `--student-orange-500: #e47a2e`
  - `--student-orange-100: #f8d7bd`
  - warm off-white page/card surfaces for contrast
- Primary navigation and strong headers use dark green; calls to action and selected accents may use orange.
- Gradients combine neighboring colors (dark green to teal, or burnt orange to light orange) and should be used selectively on the welcome/header, progress accents, and highlighted cards.
- Maintain readable WCAG contrast for text, focus rings, graph lines, and status labels. Orange is an accent, not the default body-text color.
- Preserve the application's existing light/dark theme capability; the new palette needs explicit dark-theme tokens rather than hard-coded light surfaces.

## 8. Existing content mapping

| Current Student Dashboard content | Redesign destination |
| --- | --- |
| Overview | Dashboard |
| Enrolled Subjects stat | Removed from top status cards; represented by My Classes and My Subjects |
| Scheduled Exams stat | Reclassified into To do / Missed / Done |
| Exams Completed stat | Done |
| Next up | Detailed selected-day agenda and/or concise Dashboard priority list |
| Monthly exam calendar | Compact Dashboard calendar plus expanded Schedule tab |
| My Examinations | Sidebar destination; existing workflow preserved |
| My Results | Sidebar destination; existing workflow preserved |
| My Subjects | Sidebar destination and Dashboard My Classes cells |
| Subject detail and result review | Internal destinations preserved; not duplicated in the sidebar |

## 9. Responsive behavior

- Desktop: sidebar + main content + right schedule rail.
- Tablet: sidebar remains usable; calendar rail can move below the main graph/classes when width is insufficient.
- Mobile: sidebar becomes the existing accessible drawer pattern; status cards, graph, compact calendar, agenda, and class cells stack in a logical reading order.
- The compact and expanded calendar must remain operable by keyboard and touch, with sufficiently large date/action targets.
- Avoid sticky-layer overlap with the top bar, sidebar, calendar controls, and any subject-detail tabs.

## 10. Data and behavior acceptance criteria

- Done, Missed, and To do are computed once and reused by summary cards, graph, calendar indicators, and examination filters.
- A submitted examination cannot simultaneously appear as Missed or To do.
- An upcoming examination cannot appear as Missed before its valid submission window closes.
- Attempt limits and always-open examinations are respected by the status calculation.
- Selecting a calendar day updates the detailed agenda without a page reload.
- Dashboard and Schedule tab use the same date selection and source records.
- Clicking a class cell opens the correct existing subject-detail view.
- Existing take-exam, result-review, subject, and countdown flows continue working.
- Layout is verified at desktop, tablet, and mobile widths, including dark theme and keyboard focus states.

## 11. Explicit removals/replacements

- Remove the current three dashboard stat meanings and replace them with Done, Missed, and To do.
- Remove the Achievement visualization and replace it with My Classes cells.
- Replace the separate, disconnected calendar/Next up presentation with a synchronized calendar and selected-day agenda.
- Do not remove the underlying current Student content; reorganize it into the shared sidebar, Dashboard, and Schedule tab.

## 12. Items to confirm before implementation

- Whether the progress graph should default to weekly buckets (recommended) or monthly totals.
- Whether class cells should use generated subject-category illustrations, simple icons, or existing school artwork.
- Whether `Next up` should remain as a small priority block in addition to the selected-day agenda, or be fully absorbed by the agenda.
