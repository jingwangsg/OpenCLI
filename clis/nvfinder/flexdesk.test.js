import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { BasePage } from '../../src/browser/base-page.js';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { flexdeskCommand } from './flexdesk.js';

const DAY = '2030-02-12';
const DOMAIN = 'https://nvidia.indoorfinders.com';
const CALENDAR_ID = 'RAD_SPLITTER_PANE_EXT_CONTENT_ctl00_ContentPlaceHolder1_calendarPane';
const MAP_ID = 'RAD_SPLITTER_PANE_EXT_CONTENT_ctl00_ContentPlaceHolder1_locDetailPane';
const fixtures = [];

function reservation(overrides = {}) {
    return { RegistrationID: 11, TargetDate: `${DAY}T00:00:00`, StartTime: `${DAY}T11:00:00`, EndTime: `${DAY}T18:00:00`,
        LandmarkName: 'SIN-07-A208', LandmarkSubClass: 'FlexSpace', LocID: 478, LocUTCOffset: 480,
        LocLineagePath: 'APAC > SGP - Singapore - Suntec > 7', Notes: 'Keep this note', ...overrides };
}

class FinderPage extends BasePage {
    constructor(settings = {}) {
        super();
        this.settings = settings;
        this.records = settings.records ?? [reservation()];
        this.mutations = [];
        this.nextID = 100;
        this.dom = new JSDOM('', { url: DOMAIN, runScripts: 'outside-only', pretendToBeVisual: true });
        this.install(this.dom.window);
        this.dom.window.AbortController = AbortController;
        this.dom.window.fetch = async (url, options) => {
            expect(url).toBe('/UserSite/WIO/MyRegistrationListDataGet.ashx');
            expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', body: 'UTCOffset=480', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
            if (this.settings.transportFailure) throw new Error('Connection lost');
            const status = this.settings.listStatus ?? 200;
            return { ok: status === 200, status, url: `${DOMAIN}${url}`, text: async () => this.settings.malformed ? 'not JSON' : JSON.stringify(this.settings.listPayload ?? this.records) };
        };
        fixtures.push(this);
    }
    install(w) {
        Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent.replace(/\n\s+/g, '\n'); } });
        w.HTMLElement.prototype.getClientRects = function () { return this.closest('[hidden]') ? [] : [{}]; };
        w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 });
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.document.elementFromPoint = () => null;
        w.Date.prototype.getTimezoneOffset = () => -480;
    }
    frame(id, content, url) {
        const d = this.dom.window.document;
        const card = d.createElement('div');
        card.id = id.endsWith('WindowFrame') ? id.replace(/Frame$/, 'Card') : `${id}Card`;
        card.setAttribute('role', 'dialog');
        if (id.endsWith('WindowFrame')) {
            const close = d.createElement('button');
            close.setAttribute('aria-label', 'Close dialog');
            close.onclick = () => card.remove();
            card.append(close);
        }
        const frame = d.createElement('iframe');
        frame.id = id;
        frame.src = url;
        card.append(frame);
        d.body.append(card);
        frame.contentDocument.open();
        frame.contentDocument.write(`<html><body>${content}</body></html>`);
        frame.contentDocument.close();
        this.install(frame.contentWindow);
        return frame.contentDocument;
    }
    async goto(url) {
        this.dom.reconfigure({ url });
        this.day = new URL(url).searchParams.get('SelectedDate');
        const [month, day, year] = this.day.split('/');
        this.isoDay = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const d = this.dom.window.document;
        d.title = this.settings.loggedOut ? 'Sign in' : 'Visual Reservation';
        d.body.innerHTML = `<div id="finderTabBar"><button aria-label="Open account menu for Alice (alice@nvidia.com)"></button>
            <a href="javascript:showMyReservations();void 0">My Reservations</a></div>
            <div id="lblLocFullPath">APAC SGP - Singapore - Suntec 7</div>`;
        d.querySelector('a').onclick = () => this.list();
        this.calendar = this.frame(CALENDAR_ID, '', `${DOMAIN}/UserSite/WIO/RegCalendar.aspx`);
        this.renderCalendar();
        const map = this.frame(MAP_ID, '<input id="frmSearchText"><button id="btnSearch">Search</button><div id="ol-popup-content"></div>', `${DOMAIN}/UserSite/WIO/RegMap.aspx`);
        map.defaultView.markerList = [{}];
        const occupiedSnapshot = this.records.map(r => r.LandmarkName);
        this.calendar.querySelector('a[onclick="findAvailable()"]').onclick = () => {
            map.defaultView.filterData = { StartTime: this.calendar.querySelector('#timepickerStart').value, EndTime: this.calendar.querySelector('#timepickerEnd').value };
        };
        map.querySelector('#btnSearch').onclick = () => {
            const desk = map.querySelector('input').value;
            const popup = map.querySelector('#ol-popup-content');
            const unavailable = this.settings.unavailable || (this.settings.staleOccupancy && occupiedSnapshot.includes(desk));
            popup.innerHTML = unavailable ? `<div>${desk}</div><div>Unavailable</div>` : `<div>${desk}\nAvailable for selected time</div><a onclick="reserveOpenSeating(777)">Reserve</a>`;
            const button = popup.querySelector('a');
            if (button) button.onclick = () => this.reserve(desk);
        };
    }
    renderCalendar() {
        this.calendar.body.innerHTML = '';
        for (const record of this.records.filter(r => r.TargetDate.slice(0, 10) === this.isoDay)) {
            const edit = this.calendar.createElement('a');
            edit.setAttribute('onclick', `parent.editWIO(${record.RegistrationID})`);
            edit.textContent = 'Edit';
            edit.onclick = () => this.edit(record);
            this.calendar.body.append(edit);
            const cancel = this.calendar.createElement('a');
            cancel.setAttribute('onclick', `parent.cancelWIO(${record.RegistrationID})`);
            cancel.onclick = () => this.confirm(this.dom.window.document, 'Are you sure?', 'WIORegistrationCancel.ashx', () => {
                this.records = this.records.filter(r => r.RegistrationID !== record.RegistrationID);
                this.renderCalendar();
                return { RtnCodeInt: 1 };
            });
            this.calendar.body.append(cancel);
        }
        this.timeControls(this.calendar, '08:00', '18:00');
        const availability = this.calendar.createElement('a');
        availability.setAttribute('onclick', 'findAvailable()');
        availability.onclick = () => {
            const map = this.dom.window.document.querySelector(`#${MAP_ID}`)?.contentWindow;
            if (map) map.filterData = { StartTime: this.calendar.querySelector('#timepickerStart').value, EndTime: this.calendar.querySelector('#timepickerEnd').value };
        };
        this.calendar.body.append(availability);
    }
    list() {
        const d = this.frame('myReservationsWindowFrame', '<div id="grid"></div>', `${DOMAIN}/UserSite/WIO/MyRegistrationList.aspx?EmbeddedModal=1`);
        for (const record of this.records.slice(0, 2)) {
            const row = d.createElement('div');
            row.textContent = record.LandmarkName;
            d.body.append(row);
        }
    }
    timeControls(d, start, end) {
        for (const [name, value] of [['Start', start], ['End', end]]) {
            const span = d.createElement('span');
            span.innerHTML = `<input id="timepicker${name}" role="combobox" value="${value}"><button>Select</button>`;
            d.body.prepend(span);
            span.querySelector('button').onclick = () => {
                d.querySelectorAll('[role="option"]').forEach(e => e.remove());
                for (const time of ['08:00', '11:00', '14:00', '18:00']) {
                    const option = d.createElement('li');
                    option.setAttribute('role', 'option');
                    option.textContent = time;
                    option.onclick = () => { span.querySelector('input').value = time; option.remove(); };
                    d.body.append(option);
                }
            };
        }
    }
    confirm(d, title, endpoint, mutate) {
        d.querySelector('.sweet-alert')?.remove();
        const alert = d.createElement('div');
        alert.className = 'sweet-alert';
        alert.innerHTML = `<h2>${title}</h2><p>Please confirm.</p><button class="confirm">Yes, confirmed!</button>`;
        alert.querySelector('button').dataset.endpoint = endpoint;
        alert.querySelector('button').onclick = () => {
            this.mutations.push(endpoint);
            const response = mutate();
            const ok = Array.isArray(response) ? response[0].StatusCode > 0 : response.RtnCodeInt === 1;
            alert.querySelector('h2').textContent = ok ? endpoint === 'WIORegistrationUpdate.ashx' ? 'Reservation Updated!' : 'Reservation Completed!' : this.settings.rejectionTitle ?? 'Unsuccessful';
        };
        d.body.append(alert);
    }
    edit(record) {
        const d = this.frame('registrationEditWindowFrame', `<input type="hidden" id="frmRegistrationID" value="${this.settings.wrongID ? 999 : record.RegistrationID}"><textarea id="frmNotes"></textarea><a id="btnReserve">Update Reservation</a>`, `${DOMAIN}/UserSite/WIO/MyRegistrationEdit.aspx?ID=${record.RegistrationID}`);
        this.timeControls(d, record.StartTime.slice(11, 16), record.EndTime.slice(11, 16));
        d.querySelector('textarea').value = record.Notes ?? '';
        if (this.settings.services) d.body.insertAdjacentHTML('beforeend', '<input type="checkbox" class="serviceCheckbox" checked>');
        d.querySelector('#btnReserve').onclick = () => this.confirm(d, 'Confirm Update?', 'WIORegistrationUpdate.ashx', () => {
            if (!this.settings.discardUpdate) Object.assign(record, {
                StartTime: `${this.isoDay}T${d.querySelector('#timepickerStart').value}:00`,
                EndTime: `${this.isoDay}T${d.querySelector('#timepickerEnd').value}:00`, Notes: d.querySelector('textarea').value,
            });
            return { RtnCodeInt: 1 };
        });
    }
    reserve(desk) {
        const d = this.frame('reservationWindowFrame', '<input type="hidden" id="frmLandmarkID" value="777"><select id="frmForWhom"><option value="self">Myself</option></select><textarea id="frmNotes"></textarea><button id="btnReserve">Confirm Reservation</button>', `${DOMAIN}/UserSite/WIO/WIOReserveOpenSeating.aspx?LandmarkID=777&SelectedDate=${encodeURIComponent(this.day)}`);
        this.timeControls(d, '08:00', '18:00');
        d.querySelector('#btnReserve').onclick = () => this.confirm(d, 'Confirm Reservation', 'WIOReserveOpenSeatingDo.ashx', () => {
            if (this.settings.rejectDesks?.includes(desk)) return [{ StatusCode: -1, StatusMsg: 'Desk was booked by another person' }];
            const id = this.nextID++;
            this.records.push(reservation({ RegistrationID: id, TargetDate: `${this.isoDay}T00:00:00`, LandmarkName: desk,
                StartTime: `${this.isoDay}T${d.querySelector('#timepickerStart').value}:00`, EndTime: `${this.isoDay}T${d.querySelector('#timepickerEnd').value}:00`, Notes: d.querySelector('textarea').value }));
            this.renderCalendar();
            return [{ StatusCode: id }];
        });
    }
    async evaluate(input, ...args) {
        return this.dom.window.eval(typeof input === 'function' ? `(${input.toString()})(...${JSON.stringify(args)})` : input);
    }
    async evaluateOnce(code) {
        const endpoint = this.dom.window.__resolved?.dataset.endpoint;
        const result = await this.evaluate(code);
        if (endpoint && endpoint === this.settings.lostReply) throw new Error('Mutation reply was lost');
        return result;
    }
    async sleep() {}
    async getCookies() { throw new Error('Cookies must stay in the browser'); }
    async screenshot() { return ''; }
    async tabs() { return []; }
    async selectTab() {}
}

afterEach(() => { for (const page of fixtures.splice(0)) page.dom.window.close(); });

async function run(page, args) {
    const options = { date: DAY, ...args };
    flexdeskCommand.validateArgs(options);
    return flexdeskCommand.func(page, options);
}

describe('nvfinder flexdesk browser workflow', () => {
    it('reads complete server records rather than only visible or filtered rows', async () => {
        const page = new FinderPage({ records: Array.from({ length: 205 }, (_, i) => reservation({ RegistrationID: i + 1 })) });
        const rows = await run(page, { action: 'list' });
        expect(rows).toHaveLength(205);
        expect(rows[204]).toMatchObject({ id: 205, date: DAY, start: '11:00', end: '18:00', notes: 'Keep this note' });
        expect(Object.keys(rows[0])).toEqual(flexdeskCommand.columns);
        expect(page.mutations).toEqual([]);
    });
    it('filters by date, Singapore floor, and FlexSpace type', async () => {
        const page = new FinderPage({ records: [reservation(), reservation({ TargetDate: '2030-02-13T00:00:00' }), reservation({ LocID: 999 }), reservation({ LandmarkSubClass: 'ConferenceRoom' })] });
        expect(await run(page, { action: 'list' })).toHaveLength(1);
    });
    it('reports a genuine empty result with the empty-result exit code', async () => {
        await expect(run(new FinderPage({ records: [] }), { action: 'list' })).rejects.toThrow(EmptyResultError);
    });
    it.each([{ listStatus: 500 }, { malformed: true }, { listPayload: {} }, { listPayload: [{}] }, { transportFailure: true }])('rejects failed or incomplete reads: %j', async settings => {
        await expect(run(new FinderPage(settings), { action: 'list' })).rejects.toThrow(CommandExecutionError);
    });
    it('rejects authentication failure', async () => {
        await expect(run(new FinderPage({ loggedOut: true }), { action: 'list' })).rejects.toThrow(AuthRequiredError);
    });
    it('updates the same ID and preserves the end and notes', async () => {
        const page = new FinderPage();
        expect(await run(page, { action: 'update', start: '14:00' })).toMatchObject([{ id: 11, start: '14:00', end: '18:00', notes: 'Keep this note', status: 'updated' }]);
        expect(page.mutations).toEqual(['WIORegistrationUpdate.ashx']);
    });
    it('can clear notes explicitly', async () => {
        expect(await run(new FinderPage(), { action: 'update', notes: '' })).toMatchObject([{ notes: '', status: 'updated' }]);
    });
    it('checks persisted values even when the site acknowledges success', async () => {
        await expect(run(new FinderPage({ discardUpdate: true }), { action: 'update', start: '14:00' })).rejects.toThrow('Persisted reservation does not match');
    });
    it('rejects a changed editor ID before a mutation', async () => {
        const page = new FinderPage({ wrongID: true });
        await expect(run(page, { action: 'update', start: '14:00' })).rejects.toThrow('different ID');
        expect(page.mutations).toEqual([]);
    });
    it('cancels only the specified record and verifies its absence', async () => {
        const page = new FinderPage({ records: [reservation(), reservation({ RegistrationID: 12 })] });
        expect(await run(page, { action: 'cancel', id: 11 })).toMatchObject([{ id: 11, status: 'cancelled' }]);
        expect(page.records.map(r => r.RegistrationID)).toEqual([12]);
        expect(page.mutations).toEqual(['WIORegistrationCancel.ashx']);
    });
    it('requires a unique source reservation', async () => {
        const page = new FinderPage({ records: [reservation(), reservation({ RegistrationID: 12 })] });
        await expect(run(page, { action: 'cancel' })).rejects.toThrow(ArgumentError);
        expect(page.mutations).toEqual([]);
    });
    it('cancels a record beyond the reservation list first page through the calendar', async () => {
        const page = new FinderPage({ records: [reservation(), reservation({ RegistrationID: 12 }), reservation({ RegistrationID: 13 })] });
        expect(await run(page, { action: 'cancel', id: 13 })).toMatchObject([{ id: 13, status: 'cancelled' }]);
        expect(page.records.map(r => r.RegistrationID)).toEqual([11, 12]);
    });
    it('creates and verifies a new reservation', async () => {
        const page = new FinderPage({ records: [] });
        expect(await run(page, { action: 'create', desk: 'SIN-07-A207', start: '14:00', end: '18:00', notes: 'New note' })).toMatchObject([{ id: 100, desk: 'SIN-07-A207', start: '14:00', notes: 'New note', status: 'created' }]);
        expect(page.mutations).toEqual(['WIOReserveOpenSeatingDo.ashx']);
    });
    it('does not duplicate an identical create or update', async () => {
        const page = new FinderPage();
        expect(await run(page, { action: 'create', desk: 'SIN-07-A208', start: '11:00', end: '18:00', notes: 'Keep this note' })).toMatchObject([{ status: 'unchanged' }]);
        expect(await run(page, { action: 'update', start: '11:00' })).toMatchObject([{ status: 'unchanged' }]);
        expect(page.mutations).toEqual([]);
    });
    it('replaces the desk while preserving original times and notes', async () => {
        const page = new FinderPage();
        expect(await run(page, { action: 'replace', desk: 'SIN-07-A207' })).toMatchObject([{ id: 100, desk: 'SIN-07-A207', start: '11:00', end: '18:00', notes: 'Keep this note', status: 'replaced' }]);
        expect(page.records).toHaveLength(1);
        expect(page.mutations).toEqual(['WIORegistrationCancel.ashx', 'WIOReserveOpenSeatingDo.ashx']);
    });
    it('does not cancel the source if destination preflight fails', async () => {
        const page = new FinderPage({ unavailable: true });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('unavailable');
        expect(page.records[0].RegistrationID).toBe(11);
        expect(page.mutations).toEqual([]);
    });
    it('does not cancel a source whose additional services cannot be preserved', async () => {
        const page = new FinderPage({ services: true });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('additional booked services');
        expect(page.mutations).toEqual([]);
    });
    it('restores the original after an explicit creation rejection', async () => {
        const page = new FinderPage({ rejectDesks: ['SIN-07-A207'] });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('original desk restored as reservation 100');
        expect(page.records).toMatchObject([{ LandmarkName: 'SIN-07-A208', Notes: 'Keep this note' }]);
        expect(page.mutations).toHaveLength(3);
    });
    it('loads fresh occupancy before restoration instead of reusing the cancelled desk map', async () => {
        const page = new FinderPage({ rejectDesks: ['SIN-07-A207'], staleOccupancy: true });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('original desk restored as reservation 100');
        expect(page.records).toMatchObject([{ LandmarkName: 'SIN-07-A208' }]);
    });
    it('reports failed restoration and the cancelled source ID', async () => {
        const page = new FinderPage({ rejectDesks: ['SIN-07-A207', 'SIN-07-A208'] });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('original reservation 11 was cancelled. Restoration failed');
        expect(page.records).toEqual([]);
    });
    it('does not create again or restore after a lost mutation reply', async () => {
        const page = new FinderPage({ lostReply: 'WIOReserveOpenSeatingDo.ashx' });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('Replacement result is uncertain');
        expect(page.records).toMatchObject([{ LandmarkName: 'SIN-07-A207' }]);
        expect(page.mutations).toHaveLength(2);
    });
    it('does not treat a generic post-submit Error dialog as proof of rejection', async () => {
        const page = new FinderPage({ rejectDesks: ['SIN-07-A207'], rejectionTitle: 'Error' });
        await expect(run(page, { action: 'replace', desk: 'SIN-07-A207' })).rejects.toThrow('Replacement result is uncertain');
        expect(page.mutations).toHaveLength(2);
    });
    it.each([
        { action: 'create', desk: 'SIN-07-A207', start: '25:00', end: '18:00' },
        { action: 'update', start: '19:00' },
        { action: 'update', start: '14:15' },
        { action: 'create', desk: 'SIN-07-A207', start: '14:00', end: '18:00' },
        { action: 'list', date: '2030-02-30' },
        { action: 'cancel', id: 999 },
    ])('rejects invalid or unsafe requests before mutation: %j', async args => {
        const page = new FinderPage();
        await expect(run(page, args)).rejects.toThrow();
        expect(page.mutations).toEqual([]);
    });
});
