const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const System = imports.system;

const TRAY_ICON_SIZE = 22;

let tray = null;
let icons = [];
let iconsBoxLayout = null;
let iconsContainer = null;
let panelChildSignals = {};

function init() {}

function enable() {
    GLib.idle_add(GLib.PRIORITY_LOW, createTray);
    connectPanelChildSignals();
}

function disable() {
    disconnectPanelChildSignals();
    destroyTray();
}

function createTray() {
    createIconsContainer();

    tray = new Shell.TrayManager();
    tray.connect('tray-icon-added', onTrayIconAdded);
    tray.connect('tray-icon-removed', onTrayIconRemoved);
    if (global.screen) {
        // For GNOME 3.28
        tray.manage_screen(global.screen, Main.panel.actor);
    } else {
        // For GNOME 3.30
        tray.manage_screen(Main.panel.actor);
    }
    placeTray();
}

function createIconsContainer() {
    // Create box layout for icon containers
    iconsBoxLayout = new St.BoxLayout();
    iconsBoxLayout.set_style('spacing: 13px; margin_top: 2px; margin_bottom: 2px;');

    // An empty ButtonBox will still display padding, therefore create it without visibility.
    iconsContainer = new PanelMenu.ButtonBox({visible: false});
    iconsContainer.actor.add_actor(iconsBoxLayout);
}

function onTrayIconAdded(o, icon, role, delay=1000) {
    let iconContainer = new St.Button({child: icon, visible: false});

    icon.connect("destroy", function() {
        icon.clear_effects();
        iconContainer.destroy();
    });

    iconContainer.connect('button-release-event', function(actor, event) {
        icon.click(event);
    });

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        iconContainer.visible = true;
        iconsContainer.actor.visible = true;
        return GLib.SOURCE_REMOVE;
    });

    iconsBoxLayout.insert_child_at_index(iconContainer, 0);
    icon.reactive = true;
    ensureIconSize(icon);
    icons.push(icon);
}

function ensureIconSize(icon) {
    // imports.ui.main.panel.height => 28
    // imports.ui.panel.PANEL_ICON_SIZE => 16
    // But most icons' size is 22.

    let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    let scaledIconSize = TRAY_ICON_SIZE * scaleFactor;

    let iconSize = icon.get_size()[0];
    // Some applications may use `imports.gi.Gtk.IconSize` e.g. Pidgin.
    // See https://valadoc.org/gtk+-3.0/Gtk.IconSize.html .
    if (iconSize != scaledIconSize) {
        icon.get_parent().set_size(scaledIconSize, scaledIconSize);
        icon.set_size(scaledIconSize, scaledIconSize);
    }
}

function onTrayIconRemoved(o, icon) {
    if (icons.indexOf(icon) == -1) {
        return;
    }

    let iconParent = icon.get_parent();
    if (iconParent) {
         iconParent.destroy();
    }

    // A warning like this will logged if we try to call `destroy()` on `icon` here:
    // """
    // Object Shell.TrayIcon (0x56014a3370e0), has been already deallocated — impossible to access it. This might be
    // caused by the object having been destroyed from C code using something such as destroy(), dispose(), or remove()
    // vfuncs.
    // """
    // icon.destroy();

    icons.splice(icons.indexOf(icon), 1);

    if (icons.length === 0) {
        iconsContainer.actor.visible = false;
    }
}

function connectPanelChildSignals() {
    panelChildSignals = {
        left: {
            add: Main.panel._leftBox.connect('actor_added', onPanelChange),
            del: Main.panel._leftBox.connect('actor_removed', onPanelChange)
        },
        center: {
            add: Main.panel._centerBox.connect('actor_added', onPanelChange),
            del: Main.panel._centerBox.connect('actor_removed', onPanelChange)
        },
        right: {
            add: Main.panel._rightBox.connect('actor_added', onPanelChange),
            del: Main.panel._rightBox.connect('actor_removed', onPanelChange)
        }
    }
}

function disconnectPanelChildSignals() {
    Main.panel._leftBox.disconnect(panelChildSignals.left.add);
    Main.panel._leftBox.disconnect(panelChildSignals.left.del);
    Main.panel._centerBox.disconnect(panelChildSignals.center.add);
    Main.panel._centerBox.disconnect(panelChildSignals.center.del);
    Main.panel._rightBox.disconnect(panelChildSignals.right.add);
    Main.panel._rightBox.disconnect(panelChildSignals.right.del);
}

function onPanelChange(actor, child) {
    if (!iconsBoxLayout || iconsBoxLayout.get_parent() === child) {
        return;
    }

    // refresh position on panel left/center/right
    // box add/remove child event
    placeTray();
}

function placeTray() {
    let parent = iconsContainer.actor.get_parent();
    if (parent) {
        parent.remove_actor(iconsContainer.actor);
    }

    // panel box
    let box = Main.panel._rightBox;
    box.insert_child_at_index(iconsContainer.actor, 0);
}

function destroyTray() {
    iconsContainer.actor.destroy();
    iconsContainer = null;
    iconsBoxLayout = null;
    icons = [];

    tray = null;
    // force finalizing tray to unmanage screen
    System.gc();
}
