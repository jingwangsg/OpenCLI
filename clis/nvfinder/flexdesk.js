import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError, TimeoutError } from '@jackwener/opencli/errors';

const DOMAIN = 'nvidia.indoorfinders.com';
const CALENDAR = '#RAD_SPLITTER_PANE_EXT_CONTENT_ctl00_ContentPlaceHolder1_calendarPane';
const MAP = '#RAD_SPLITTER_PANE_EXT_CONTENT_ctl00_ContentPlaceHolder1_locDetailPane';
const EDIT = '#registrationEditWindowFrame';
const RESERVE = '#reservationWindowFrame';
const ACTIONS = ['list', 'create', 'update', 'cancel', 'replace'];

export const flexdeskCommand = cli({
    site: 'nvfinder',
    name: 'flexdesk',
    access: 'write',
    description: 'List, create, update, cancel, or replace your Singapore Suntec Flex Desk reservation',
    example: 'opencli --profile prisma nvfinder flexdesk list --date today',
    domain: DOMAIN,
    strategy: Strategy.UI,
    browser: true,
    navigateBefore: false,
    siteSession: 'persistent',
    defaultWindowMode: 'foreground',
    args: [
        { name: 'action', positional: true, required: true, choices: ACTIONS, help: 'list, create, update, cancel, or replace' },
        { name: 'date', default: 'today', valueRequired: true, help: 'today or YYYY-MM-DD, in Singapore time' },
        { name: 'id', type: 'int', valueRequired: true, help: 'Reservation ID from list; disambiguates update, cancel, or replace' },
        { name: 'desk', valueRequired: true, help: 'Destination desk, such as SIN-07-A207; required for create and replace' },
        { name: 'start', valueRequired: true, help: 'Start in HH:mm; required for create, otherwise preserves the original' },
        { name: 'end', valueRequired: true, help: 'End in HH:mm; required for create, otherwise preserves the original' },
        { name: 'notes', valueRequired: true, help: 'Notes; omitted preserves existing notes' },
    ],
    columns: ['id', 'date', 'desk', 'location', 'start', 'end', 'notes', 'status'],
    validateArgs(args) {
        if (!ACTIONS.includes(args.action)) throw new ArgumentError(`action must be one of ${ACTIONS.join(', ')}`);
        if (args.id !== undefined && (!Number.isSafeInteger(args.id) || args.id <= 0)) throw new ArgumentError('id must be a positive integer');
        if (args.desk !== undefined && !/^SIN-07-[A-Z0-9]+$/.test(args.desk)) throw new ArgumentError('desk must be a Singapore Suntec floor 7 desk, such as SIN-07-A207');
        for (const key of ['start', 'end']) {
            if (args[key] !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(args[key])) throw new ArgumentError(`${key} must be HH:mm`);
        }
        if (args.start && args.end && args.start >= args.end) throw new ArgumentError('start must be before end');
        if (['create', 'replace'].includes(args.action) && !args.desk) throw new ArgumentError(`${args.action} requires --desk`);
        if (args.action === 'create' && (!args.start || !args.end)) throw new ArgumentError('create requires --start and --end');
        if (args.action === 'update' && args.start === undefined && args.end === undefined && args.notes === undefined) throw new ArgumentError('update requires --start, --end, or --notes');
        if (['list', 'cancel'].includes(args.action) && ['desk', 'start', 'end', 'notes'].some(key => args[key] !== undefined)) throw new ArgumentError(`${args.action} does not accept desk, start, end, or notes`);
        if (args.action === 'update' && args.desk !== undefined) throw new ArgumentError('Use replace to change desks');
        if (args.action === 'create' && args.id !== undefined) throw new ArgumentError('create does not accept --id');
    },
    async func(page, args) {
        const date = args.date === 'today' || args.date === undefined
            ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
            : String(args.date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new ArgumentError('date must be today or a valid YYYY-MM-DD');
        await openFinder(page, date);
        const reservations = await readReservations(page, date);
        const matches = reservations.filter(row => args.id === undefined || row.id === args.id);
        if (args.action === 'list') {
            if (!matches.length) throw new EmptyResultError('nvfinder flexdesk list', `No reservations for ${date}`);
            return matches;
        }
        let original;
        if (args.action !== 'create') {
            if (!matches.length) throw new EmptyResultError(`nvfinder flexdesk ${args.action}`, `No matching reservation for ${date}`);
            if (matches.length !== 1) throw new ArgumentError('Multiple reservations match; supply --id from list');
            original = matches[0];
        }
        if (args.action === 'cancel') {
            await cancelReservation(page, original);
            return [{ ...original, status: 'cancelled' }];
        }
        const desired = {
            ...original, date, desk: args.desk ?? original.desk,
            start: args.start ?? original.start, end: args.end ?? original.end,
            notes: args.notes ?? original?.notes ?? '',
        };
        if (desired.start >= desired.end) throw new ArgumentError('start must be before end');
        const identical = reservations.find(row => row.desk === desired.desk && row.start === desired.start && row.end === desired.end && row.notes === desired.notes);
        if (identical && (args.action === 'create' || identical.id === original?.id)) return [{ ...identical, status: 'unchanged' }];
        if (args.action === 'update' || (args.action === 'replace' && desired.desk === original.desk)) {
            await openEditor(page, original);
            await setTime(page, EDIT, 'timepickerStart', desired.start);
            await setTime(page, EDIT, 'timepickerEnd', desired.end);
            await fill(page, EDIT, '#frmNotes', desired.notes);
            await confirmMutation(page, EDIT, '#btnReserve', 'Confirm Update?', 'WIORegistrationUpdate.ashx');
            const saved = (await readReservations(page, date)).find(row => row.id === original.id);
            verifyReservation(saved, desired);
            return [{ ...saved, status: 'updated' }];
        }
        if (args.action === 'create') {
            if (reservations.some(row => row.start < desired.end && desired.start < row.end)) throw new ArgumentError('An overlapping reservation already exists; use replace');
            return [{ ...await createReservation(page, desired), status: 'created' }];
        }
        if (await openEditor(page, original)) throw new ArgumentError('replace cannot preserve additional booked services; change this reservation in Finder directly');
        await prepareReservation(page, desired);
        await cancelReservation(page, original);
        try {
            return [{ ...await createReservation(page, desired), status: 'replaced' }];
        } catch (error) {
            // A missing reply is not proof that creation failed; never retry an uncertain write.
            if (!error.mutationRejected) throw new CommandExecutionError(`Replacement result is uncertain after cancelling ${original.id}. Run list before taking another action. ${error.message}`);
            let restored;
            try {
                restored = await createReservation(page, original);
            } catch (restoreError) {
                throw new CommandExecutionError(`Replacement failed and original reservation ${original.id} was cancelled. Restoration failed: ${restoreError.message}`);
            }
            throw new CommandExecutionError(`Replacement was rejected; original desk restored as reservation ${restored.id}. ${error.message}`);
        }
    },
});

async function openFinder(page, date) {
    const [year, month, day] = date.split('-').map(Number);
    await page.goto(`https://${DOMAIN}/UserSite/WIO/VisualRegistration.aspx?ModuleID=16&LocID=478&SelectedDate=${encodeURIComponent(`${month}/${day}/${year}`)}&rand=${Date.now()}`);
    const state = await waitFor(page, () => {
        if (location.hostname !== 'nvidia.indoorfinders.com' || /sign in|log in/i.test(document.title)) return { auth: false };
        const account = document.querySelector('button[aria-label^="Open account menu for "]')?.getAttribute('aria-label');
        const loc = document.querySelector('#lblLocFullPath')?.textContent;
        return account && loc && document.querySelector('iframe[id*="calendarPane"]') ? { auth: true, account, loc, offset: new Date().getTimezoneOffset() } : null;
    }, undefined, 'Finder account and location');
    if (!state.auth || !/@nvidia\.com\)/i.test(state.account)) throw new AuthRequiredError(DOMAIN, 'Sign in to the intended NVIDIA account in the selected browser profile');
    if (!state.loc.includes('SGP - Singapore - Suntec') || state.offset !== -480) throw new CommandExecutionError('Expected Singapore Suntec and a browser using Singapore time');
}

async function closeDialogs(page) {
    for (let n = 0; n < 4; n++) {
        const id = await page.evaluate(() => Array.from(document.querySelectorAll('[id$="WindowCard"][role="dialog"]'))
            .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').at(-1)?.id);
        if (!id) return;
        await page.click(`#${id} button[aria-label="Close dialog"]`, { method: 'js' });
    }
    throw new CommandExecutionError('Finder dialogs did not close');
}

async function waitFor(page, read, arg, label) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const result = await page.evaluate(read, arg);
        if (result) return result;
        await page.sleep(0.2);
    }
    throw new TimeoutError(label, 30);
}

async function readReservations(page, date) {
    let response;
    try {
        response = await page.evaluate(async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const r = await fetch('/UserSite/WIO/MyRegistrationListDataGet.ashx', {
                    method: 'POST', credentials: 'same-origin', signal: controller.signal,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: 'UTCOffset=480',
                });
                return { ok: r.ok, status: r.status, url: r.url, text: await r.text() };
            } finally { clearTimeout(timer); }
        });
    } catch (error) { throw new CommandExecutionError(`Finder reservation query failed: ${error.message}`); }
    if ([401, 403].includes(response.status) || new URL(response.url).hostname !== DOMAIN || /login/i.test(new URL(response.url).pathname)) throw new AuthRequiredError(DOMAIN);
    if (!response.ok) throw new CommandExecutionError(`Finder reservation query failed: HTTP ${response.status}`);
    let data;
    try { data = JSON.parse(response.text); }
    catch { throw new CommandExecutionError('Finder reservation query returned malformed JSON'); }
    if (!Array.isArray(data)) throw new CommandExecutionError('Finder reservation list schema changed');
    if (data.some(item => !item || !Number.isSafeInteger(item.RegistrationID) || !Number.isSafeInteger(item.LocID) || !/^\d{4}-\d{2}-\d{2}T/.test(item.TargetDate))) throw new CommandExecutionError('Finder reservation identity or date fields changed');
    return data.filter(item => item.LocID === 478 && item.LandmarkSubClass === 'FlexSpace' && item.TargetDate?.slice(0, 10) === date).map(item => {
        if (!Number.isSafeInteger(item.RegistrationID) || item.RegistrationID <= 0 || !/^SIN-07-[A-Z0-9]+$/.test(item.LandmarkName)
            || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(item.StartTime) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(item.EndTime)
            || typeof item.LocLineagePath !== 'string' || item.LocUTCOffset !== 480 || (item.Notes !== undefined && typeof item.Notes !== 'string')) throw new CommandExecutionError('Finder reservation fields changed');
        return { id: item.RegistrationID, date, desk: item.LandmarkName, location: item.LocLineagePath,
            start: item.StartTime.slice(11, 16), end: item.EndTime.slice(11, 16), notes: item.Notes ?? '', status: 'reserved' };
    });
}

async function fill(page, frame, selector, value) {
    const result = await page.fillText(selector, value, { frame });
    if (!result.verified) throw new CommandExecutionError(`Finder did not retain the value for ${selector}`);
}

async function openEditor(page, original) {
    await closeDialogs(page);
    await waitFor(page, ({ frame, id }) => !!document.querySelector(frame)?.contentDocument?.querySelector(`a[onclick="parent.editWIO(${id})"]`), { frame: CALENDAR, id: original.id }, 'calendar reservation action');
    await page.click(`a[onclick="parent.editWIO(${original.id})"]`, { frame: CALENDAR, method: 'js' });
    const state = await waitFor(page, frame => {
        const d = document.querySelector(frame)?.contentDocument;
        return d?.querySelector('#timepickerStart[role="combobox"]') && {
            id: Number(d.querySelector('#frmRegistrationID')?.value), start: d.querySelector('#timepickerStart').value,
            end: d.querySelector('#timepickerEnd')?.value, notes: d.querySelector('#frmNotes')?.value,
            services: d.querySelectorAll('.serviceCheckbox:checked').length,
        };
    }, EDIT, 'reservation editor');
    if (state.id !== original.id) throw new CommandExecutionError('Reservation editor opened a different ID');
    if (['start', 'end', 'notes'].some(key => state[key] !== original[key])) throw new CommandExecutionError('Reservation changed since list was read; inspect list before updating');
    return state.services;
}

async function setTime(page, frame, field, value) {
    const current = await page.evaluate((f, id) => document.querySelector(f)?.contentDocument?.getElementById(id)?.value, frame, field);
    if (current === value) return;
    await page.click(`#${field} + button`, { frame, method: 'js' });
    const option = await page.evaluate((f, text) => {
        const d = document.querySelector(f).contentDocument;
        const options = Array.from(d.querySelectorAll('[role="option"]'));
        const matches = options.map((e, nth) => ({ e, nth })).filter(({ e }) => e.getClientRects().length && e.textContent.trim() === text);
        return matches.length === 1 ? matches[0].nth : null;
    }, frame, value);
    if (option === null) throw new ArgumentError(`${value} is not a unique available time option`);
    await page.click('[role="option"]', { frame, nth: option, method: 'js' });
    const selected = await page.evaluate((f, id) => document.querySelector(f).contentDocument.getElementById(id).value, frame, field);
    if (selected !== value) throw new CommandExecutionError(`Finder did not select ${value}`);
}

async function prepareReservation(page, desired) {
    await closeDialogs(page);
    await waitFor(page, frame => !!document.querySelector(frame)?.contentDocument?.querySelector('#timepickerStart[role="combobox"]'), CALENDAR, 'calendar time controls');
    await setTime(page, CALENDAR, 'timepickerStart', desired.start);
    await setTime(page, CALENDAR, 'timepickerEnd', desired.end);
    const availability = await page.evaluate(frame => Array.from(document.querySelector(frame).contentDocument.querySelectorAll('a[onclick="findAvailable()"]'))
        .map((e, nth) => ({ e, nth })).filter(({ e }) => e.getClientRects().length).map(({ nth }) => nth), CALENDAR);
    if (availability.length !== 1) throw new CommandExecutionError('Finder availability action is ambiguous');
    await page.click('a[onclick="findAvailable()"]', { frame: CALENDAR, nth: availability[0], method: 'js' });
    await waitFor(page, ({ frame, start, end }) => {
        const w = document.querySelector(frame)?.contentWindow;
        return w?.document.querySelector('#frmSearchText') && w.markerList?.length && w.filterData?.StartTime?.slice(0, 5) === start && w.filterData?.EndTime?.slice(0, 5) === end;
    }, { frame: MAP, start: desired.start, end: desired.end }, 'desk availability for selected times');
    await fill(page, MAP, '#frmSearchText', desired.desk);
    await page.click('#btnSearch', { frame: MAP, method: 'js' });
    const target = await waitFor(page, frame => {
        const d = document.querySelector(frame)?.contentDocument;
        const popup = d?.querySelector('#ol-popup-content');
        const links = Array.from(popup?.querySelectorAll('a') ?? []).filter(a => a.textContent.trim() === 'Reserve');
        return popup?.innerText && { text: popup.innerText, action: links.length === 1 ? links[0].getAttribute('onclick') : null };
    }, MAP, 'desk availability');
    if (!target.text.split('\n').map(s => s.trim()).includes(desired.desk) || !/^reserveOpenSeating\(\d+\)$/.test(target.action ?? '')) throw new CommandExecutionError('The requested desk is unavailable or the search is ambiguous');
    await page.click(`#ol-popup-content a[onclick="${target.action}"]`, { frame: MAP, method: 'js' });
    const form = await waitFor(page, frame => {
        const d = document.querySelector(frame)?.contentDocument;
        const start = d?.querySelector('#timepickerStart[role="combobox"]');
        return start && d.querySelector('#btnReserve')?.getClientRects().length ? {
            landmark: d.querySelector('#frmLandmarkID')?.value, forWhom: d.querySelector('#frmForWhom')?.value,
            day: new URL(d.location.href).searchParams.get('SelectedDate'),
        } : null;
    }, RESERVE, 'reservation form');
    const [year, month, day] = desired.date.split('-').map(Number);
    if (form.landmark !== target.action.match(/\d+/)[0] || form.forWhom !== 'self' || form.day !== `${month}/${day}/${year}`) throw new CommandExecutionError('Finder reservation form target does not match the requested desk, date, or account');
    await setTime(page, RESERVE, 'timepickerStart', desired.start);
    await setTime(page, RESERVE, 'timepickerEnd', desired.end);
    await fill(page, RESERVE, '#frmNotes', desired.notes);
}

async function confirmMutation(page, frame, selector, title, endpoint, dialogFrame = frame) {
    await page.click(selector, { frame, method: 'js' });
    const dialog = await waitFor(page, f => {
        const d = f === null ? document : document.querySelector(f)?.contentDocument;
        const alert = d?.querySelector('.sweet-alert');
        return alert?.getClientRects().length && { title: alert.querySelector('h2')?.textContent.trim(), text: alert.querySelector('p')?.textContent.trim() };
    }, dialogFrame, 'reservation confirmation');
    if (dialog.title !== title) {
        const error = new CommandExecutionError(`Finder rejected the operation: ${dialog.title}: ${dialog.text}`);
        error.mutationRejected = true;
        throw error;
    }
    await page.click('.sweet-alert button.confirm', { frame: dialogFrame ?? undefined, method: 'js' });
    if (endpoint === 'WIORegistrationCancel.ashx') return;
    const result = await waitFor(page, ({ f, previousTitle }) => {
        const d = document.querySelector(f)?.contentDocument;
        const alert = d?.querySelector('.sweet-alert');
        if (!d?.querySelector('#btnReserve')) return { closed: true };
        const titleText = alert?.querySelector('h2')?.textContent.trim();
        return alert?.getClientRects().length && titleText !== previousTitle ? { title: titleText, text: alert.querySelector('p')?.textContent.trim() } : null;
    }, { f: frame, previousTitle: title }, 'reservation result; inspect list before retrying');
    const success = endpoint === 'WIORegistrationUpdate.ashx' ? 'Reservation Updated!' : 'Reservation Completed!';
    if (!result.closed && result.title !== success) {
        const error = new CommandExecutionError(`Finder operation did not complete: ${result.title}: ${result.text}`);
        if (result.title === 'Unsuccessful') error.mutationRejected = true;
        throw error;
    }
}

async function cancelReservation(page, original) {
    const current = (await readReservations(page, original.date)).find(row => row.id === original.id);
    verifyReservation(current, original);
    await closeDialogs(page);
    await waitFor(page, ({ frame, id }) => !!document.querySelector(frame)?.contentDocument?.querySelector(`a[onclick="parent.cancelWIO(${id})"]`), { frame: CALENDAR, id: original.id }, 'cancellation action');
    await confirmMutation(page, CALENDAR, `a[onclick="parent.cancelWIO(${original.id})"]`, 'Are you sure?', 'WIORegistrationCancel.ashx', null);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (!(await readReservations(page, original.date)).some(row => row.id === original.id)) return;
        await page.sleep(0.2);
    }
    throw new CommandExecutionError('Cancellation was not persisted; do not submit it again without checking list');
}

async function createReservation(page, desired) {
    // Replacement and restoration must load fresh map occupancy after cancellation.
    try { await openFinder(page, desired.date); await prepareReservation(page, desired); }
    catch (error) { error.mutationRejected = true; throw error; }
    await confirmMutation(page, RESERVE, '#btnReserve', 'Confirm Reservation', 'WIOReserveOpenSeatingDo.ashx');
    const saved = (await readReservations(page, desired.date)).filter(row => row.desk === desired.desk && row.start === desired.start && row.end === desired.end);
    if (saved.length !== 1) throw new CommandExecutionError('Created reservation could not be uniquely verified; inspect list before retrying');
    verifyReservation(saved[0], desired);
    return saved[0];
}

function verifyReservation(actual, desired) {
    if (!actual || ['date', 'desk', 'start', 'end', 'notes'].some(key => actual[key] !== desired[key])) throw new CommandExecutionError('Persisted reservation does not match the requested values; inspect list before retrying');
}
