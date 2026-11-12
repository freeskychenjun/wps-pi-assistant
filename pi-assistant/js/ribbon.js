// pi-assistant P0：最小 ribbon 逻辑
function OnAddinLoad(ribbonUI) {
    if (typeof (window.Application.ribbonUI) != "object") {
        window.Application.ribbonUI = ribbonUI
    }
    if (typeof (window.Application.Enum) != "object") {
        window.Application.Enum = WPS_Enum
    }
    // 启动即自动打开侧栏（省得每次找「AI 助手 → 打开侧栏」）
    setTimeout(function () {
        try {
            var tsId = window.Application.PluginStorage.getItem("taskpane_id")
            var tskpane = tsId ? window.Application.GetTaskPane(tsId) : null
            if (!tskpane) {
                tskpane = window.Application.CreateTaskPane(GetUrlPath() + "/ui/taskpane.html")
                window.Application.PluginStorage.setItem("taskpane_id", tskpane.ID)
            }
            if (tskpane) tskpane.Visible = true
        } catch (e) {}
    }, 1500)
    return true
}

function OnAction(control) {
    if (control.Id === "btnShowTaskPane") {
        let tsId = window.Application.PluginStorage.getItem("taskpane_id")
        let tskpane = tsId ? window.Application.GetTaskPane(tsId) : null
        if (!tskpane) {
            tskpane = window.Application.CreateTaskPane(GetUrlPath() + "/ui/taskpane.html")
            window.Application.PluginStorage.setItem("taskpane_id", tskpane.ID)
            tskpane.Visible = true
        } else {
            tskpane.Visible = !tskpane.Visible
        }
    }
    return true
}

function GetImage(control) {
    return "images/3.svg"
}

function OnGetEnabled(control) {
    return true
}

function OnGetVisible(control) {
    return true
}
