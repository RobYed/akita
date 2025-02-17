import { currentAction, setSkipAction } from './actions';
import { isDefined } from './isDefined';
import { $$addStore, $$deleteStore, $$updateStore } from './dispatchers';
import { __stores__ } from './stores';
import { capitalize } from './captialize';
import { isNotBrowser } from './root';

export type DevtoolsOptions = {
  /**  maximum allowed actions to be stored in the history tree */
  maxAge: number;
  latency: number;
  actionsBlacklist: string[];
  actionsWhitelist: string[];
  shouldCatchErrors: boolean;
  logTrace: boolean;
  predicate: (state: any, action: any) => boolean;
  shallow: boolean;
};
let subs = [];

export type NgZoneLike = { run: any };

export function akitaDevtools(ngZone: NgZoneLike, options?: Partial<DevtoolsOptions>);
export function akitaDevtools(options?: Partial<DevtoolsOptions>);
export function akitaDevtools(ngZoneOrOptions?: NgZoneLike | Partial<DevtoolsOptions>, options: Partial<DevtoolsOptions> = {}) {
  if (isNotBrowser) return;

  if (!(window as any).__REDUX_DEVTOOLS_EXTENSION__) {
    return;
  }

  subs.length &&
    subs.forEach(s => {
      if (s.unsubscribe) {
        s.unsubscribe();
      } else {
        s && s();
      }
    });

  const isAngular = ngZoneOrOptions && ngZoneOrOptions['run'];

  if (!isAngular) {
    ngZoneOrOptions = ngZoneOrOptions || {};
    (ngZoneOrOptions as any).run = cb => cb();
    options = ngZoneOrOptions as Partial<DevtoolsOptions>;
  }

  const defaultOptions: Partial<DevtoolsOptions> & { name: string } = { name: 'Akita', shallow: true };
  const merged = Object.assign({}, defaultOptions, options);

  const devTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__.connect(merged);
  let appState = {};

  subs.push(
    $$addStore.subscribe(storeName => {
      appState = {
        ...appState,
        [storeName]: __stores__[storeName]._value()
      };
      devTools.send({ type: `[${capitalize(storeName)}] - @@INIT` }, appState);
    })
  );

  subs.push(
    $$deleteStore.subscribe(storeName => {
      delete appState[storeName];
      devTools.send({ type: `[${storeName}] - Delete Store` }, appState);
    })
  );

  subs.push(
    $$updateStore.subscribe(storeName => {
      const { type, entityIds, skip } = currentAction;

      if (skip) {
        setSkipAction(false);
        return;
      }

      const store = __stores__[storeName];
      if (!store) {
        return;
      }

      if (options.shallow === false && appState[storeName]) {
        const isEqual = JSON.stringify(store._value()) === JSON.stringify(appState[storeName]);
        if (isEqual) return;
      }

      appState = {
        ...appState,
        [storeName]: store._value()
      };

      const normalize = capitalize(storeName);
      let msg = isDefined(entityIds) ? `[${normalize}] - ${type} (ids: ${entityIds})` : `[${normalize}] - ${type}`;

      if (options.logTrace) {
        console.group(msg);
        console.trace();
        console.groupEnd();
      }

      devTools.send({ type: msg }, appState);
    })
  );

  subs.push(
    devTools.subscribe(message => {
      if (message.type === 'DISPATCH') {
        const payloadType = message.payload.type;

        if (payloadType === 'COMMIT') {
          devTools.init(appState);
          return;
        }

        if (message.state) {
          const rootState = JSON.parse(message.state);
          for (let i = 0, keys = Object.keys(rootState); i < keys.length; i++) {
            const storeName = keys[i];
            if (__stores__[storeName]) {
              (ngZoneOrOptions as NgZoneLike).run(() => {
                __stores__[storeName]._setState(() => rootState[storeName], false);
              });
            }
          }
        }
      }
    })
  );
}
