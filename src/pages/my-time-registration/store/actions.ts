import {
  addMonths,
  subMonths,
  differenceInSeconds,
  startOfMonth,
  startOfDay,
  addSeconds,
} from 'date-fns';
import isSameDay from 'date-fns/isSameDay';
import { differenceWith, isEqual, keyBy, uniq, uniqBy, uniqWith } from 'lodash';
import { get } from 'svelte/store';
import type { TaskDto } from '../../../apis/tasks.api';
import {
  BulkUpsertEntry,
  bulkUpsertTasksLog,
} from '../../../apis/tasks-log.api';
import {
  currentMonth,
  editingValue,
  enteringMode,
  loadingLogs,
  logEntries,
  logEntriesAreLoading,
  LogEntry,
  selectedLogs,
  Task,
  tasksState,
  typesOfWork,
} from './state';
import type { TypeOfWorkDto } from '../../../apis/types-of-work.api';

export function goNextMonth() {
  currentMonth.update((state) => {
    if (state === null) return null;

    return addMonths(state, 1);
  });
}

export function goPreviousMonth() {
  currentMonth.update((state) => {
    if (state === null) return null;

    return subMonths(state, 1);
  });
}

export function refreshData() {
  const diffSeconds = differenceInSeconds(new Date(), startOfDay(new Date()));
  let month =
    get(currentMonth).getFullYear() < 2000
      ? startOfMonth(new Date())
      : startOfMonth(get(currentMonth));

  // we do this just to trigger the refresh effect
  currentMonth.set(addSeconds(month, diffSeconds));
}

export function logEntriesLoadingStarted() {
  logEntriesAreLoading.set(true);
  logEntries.set([]);
  tasksState.set({
    byId: {},
    allIds: [],
  });
  selectedLogs.set([]);
  loadingLogs.set([]);
  enteringMode.set('none');
  editingValue.set('');
}

export function logEntriesLoaded(entries: LogEntry[], types: TypeOfWorkDto[]) {
  logEntries.set(entries);
  typesOfWork.set(types);

  const tasks = uniqBy(
    entries.map(
      (log) =>
        ({
          description: log.custRefDescription,
          project: log.projectName,
          taskId: log.taskId,
        } as Task)
    ),
    (p) => p.taskId
  );

  tasksState.set({
    byId: keyBy(tasks, (t) => t.taskId),
    allIds: tasks.map((t) => t.taskId),
  });

  logEntriesAreLoading.set(false);
}

export function addNewTask(task: TaskDto) {
  tasksState.update((old) => {
    return {
      byId: {
        ...old.byId,
        [task.taskId]: task,
      },
      allIds: uniq([...old.allIds, task.taskId]),
    };
  });
}

export function selectLog(taskId: number, day: Date, ctrlPressed: boolean) {
  selectedLogs.update((prevSelected) => {
    if (ctrlPressed) {
      const existingLog = prevSelected.find(
        (s) => s.taskId === taskId && isSameDay(s.day, day)
      );
      if (existingLog !== undefined) {
        return prevSelected.filter((s) => s !== existingLog);
      }
      return [...prevSelected, { day, taskId }];
    }
    return [{ day, taskId }];
  });
  enteringMode.set('none');
}

export function updateEditingValue(newValue: string) {
  editingValue.set(newValue);
}

export async function submitHours(
  typeOfWork: string,
  hours: number,
  description: string,
  isWorkFromHome: boolean,
  workFromHomeStarted: number
) {
  const selected = get(selectedLogs);
  loadingLogs.update((old) => {
    return uniqWith([...old, ...selected], isEqual);
  });

  selectedLogs.set([]);
  enteringMode.set('none');

  // const newHoursValue = parseFloat(get(editingValue));
  const existingEntries = get(logEntries);
  const upsertEntries = selected.map<BulkUpsertEntry>((s) => {
    const existingOne = existingEntries.find(
      (e) => e.taskId === s.taskId && isSameDay(s.day, e.date)
    );
    return {
      uid: existingOne?.uid,
      date: s.day,
      taskId: s.taskId,
      typeOfWork,
      isWorkFromHome,
      workFromHomeStarted,
      hours,
      description,
    };
  });
  const updatedLogs = await bulkUpsertTasksLog(upsertEntries);
  logEntries.update((oldEntries) => {
    let result = differenceWith(
      oldEntries,
      updatedLogs,
      (a, b) => a.taskId === b.taskId && isSameDay(a.date, b.date)
    );
    const notDeletedEntries = updatedLogs.filter((l) => l.hours > 0);
    return [...result, ...notDeletedEntries];
  });

  loadingLogs.update((old) => {
    return differenceWith(old, selected, isEqual);
  });
}

export function enterKeyPressed() {
  const selected = get(selectedLogs);
  if (selected.length === 0) {
    return;
  }

  const mode = get(enteringMode);
  if (mode === 'none') {
    editingValue.set('0');
    // enteringMode.set('hours');
    enteringMode.set('full');
  } else {
    enteringMode.set('none');
  }
}

export function escapeKeyPressed() {
  selectedLogs.set([]);
  enteringMode.set('none');
}
