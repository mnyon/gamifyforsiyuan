/** The host supplies these APIs. Keep this contract limited to the APIs this plugin uses. */
declare module 'siyuan' {
  export class Plugin {
    name: string;
    setting: { open(): void };
    eventBus: {
      on(name: 'ws-main', listener: (event: CustomEvent<{ cmd?: string }>) => void): void;
      off(name: 'ws-main', listener: (event: CustomEvent<{ cmd?: string }>) => void): void;
    };
    addIcons(svg: string): void;
    addDock(options: {
      type: string;
      config: {
        position: 'RightBottom';
        size: { width: number; height: number };
        icon: string;
        title: string;
        show: boolean;
      };
      data: object;
      init(): void;
    }): void;
    addTopBar(options: { icon: string; title: string; position: 'right'; callback(): void }): void;
  }
  export class Dialog {
    element: HTMLElement;
    constructor(options: {
      title: string;
      content: string;
      width: string;
      destroyCallback(): void;
    });
    destroy(): void;
  }
  export function getFrontend(): string;
  export function toggleRightDock(show: boolean): void;
}
declare var siyuan:
  | {
      config?: {
        readonly?: boolean;
        system?: { workspaceDir?: string };
        appearance?: { mode?: number };
      };
      isPublish?: boolean;
    }
  | undefined;
declare const TEST_BUILD: boolean;
