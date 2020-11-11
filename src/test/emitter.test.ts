import t = require('tap');
//t.runOnly = true;

import {
    Emitter,
    subscribeToManyEmitters,
} from '../util/emitter';
import {
    sleep
} from '../util/helpers';

t.test('emitter sync', async (t: any) => {
    let e = new Emitter<number>();

    let logs: number[] = [];
    let unsub1 = e.subscribe((n) => { logs.push(n) });
    let unsub2 = e.subscribe((n) => { logs.push(n) });

    e.send(1);
    e.send(2);

    t.same(logs, [1, 1, 2, 2], 'subscriptions ran in same order they were created');

    unsub1();
    e.send(3);
    unsub2();
    e.send(4);

    t.same(logs, [1, 1, 2, 2, 3], 'unsub works');

    t.end();
});

t.test('emitter async', async (t: any) => {
    let e = new Emitter<string>();

    let logs: string[] = [];

    let unsub1 = e.subscribe(async (s) => {
        logs.push(`${s} cb begin 1`);
        sleep(100);
        logs.push(`${s} cb end 1`);
    });
    let unsub2 = e.subscribe(async (s) => {
        logs.push(`${s} cb begin 2`);
        sleep(100);
        logs.push(`${s} cb end 2`);
    });

    logs.push(`a before send`);
    await e.send('a');
    logs.push(`a after send`);

    t.same(logs, ['a before send', 'a cb begin 1', 'a cb end 1', 'a cb begin 2', 'a cb end 2', 'a after send'], 'send waits for cb to finish');

    t.end();
});

t.test('emitter subscribeToMany', async (t: any) => {
    let e1 = new Emitter<number>();
    let e2 = new Emitter<number>();

    let logs: number[] = [];
    let unsub = subscribeToManyEmitters([e1, e2], (n) => { logs.push(n) });

    e1.send(1);
    e2.send(2);

    t.same(logs, [1, 2], 'subscriptions fired');

    unsub();
    e1.send(3);
    e2.send(3);

    t.same(logs, [1, 2], 'unsub works');

    t.end();
});