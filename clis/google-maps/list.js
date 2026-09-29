import { cli, Strategy } from '@jackwener/opencli/registry';
import { listId, mapsAccount, readList } from './api.js';

cli({
    site: 'google-maps', name: 'list', access: 'read',
    description: 'Read all places and notes from a Google Maps saved list',
    domain: 'www.google.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
    args: [{ name: 'list', positional: true, required: true, help: 'Saved-list id or full Google Maps list URL' },
        { name: 'account', type: 'int', help: 'Google account index; defaults to the URL authuser or 0' }],
    columns: ['rank', 'placeId', 'name', 'note', 'url'],
    func: async (page, args) => (await readList(page, listId(args.list), mapsAccount(args.list, args.account))).items,
});

cli({
    site: 'google-maps', name: 'list-info', access: 'read',
    description: 'Read Google Maps saved-list name, description, and item count',
    domain: 'www.google.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
    args: [{ name: 'list', positional: true, required: true, help: 'Saved-list id or full Google Maps list URL' },
        { name: 'account', type: 'int', help: 'Google account index; defaults to the URL authuser or 0' }],
    columns: ['listId', 'name', 'description', 'count', 'url'],
    func: async (page, args) => {
        const list = await readList(page, listId(args.list), mapsAccount(args.list, args.account));
        return [{ listId: list.id, name: list.name, description: list.description, count: list.items.length, url: list.url }];
    },
});
