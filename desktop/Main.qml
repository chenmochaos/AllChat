import QtQuick
import QtQuick.Window
import QtWebEngine

Window {
    id: window
    width: Math.min(1180, Screen.availableWidth)
    height: Math.min(850, Screen.availableHeight)
    minimumWidth: 360
    minimumHeight: 380
    visible: true
    color: "#050505"
    title: "AllChat"
    property url workspaceUrl
    property string failure: ""
    property bool rendererStopped: false

    WebEngineView {
        id: web
        anchors.fill: parent
        backgroundColor: window.color
        url: window.workspaceUrl
        visible: window.failure === ""
        onRenderProcessTerminated: (status, code) => {
            console.warn("AllChat web renderer exited", status, code)
            window.rendererStopped = true
            window.failure = qsTr("页面显示进程已退出。点击这里重新打开会话。")
        }
        onNavigationRequested: request => {
            if (request.isMainFrame && request.url.toString().split("#")[0] !== window.workspaceUrl.toString().split("#")[0])
                request.reject()
        }
        onLoadingChanged: info => {
            if (info.status === WebEngineView.LoadFailedStatus)
                window.failure = qsTr("工作区加载失败。") + " " + info.errorString
        }
    }
    Text {
        visible: window.failure !== ""
        anchors.centerIn: parent
        width: Math.min(500, parent.width - 40)
        wrapMode: Text.Wrap
        color: "#ddd"
        text: window.failure
        textFormat: Text.PlainText
        MouseArea {
            anchors.fill: parent
            enabled: window.rendererStopped
            onClicked: {
                window.rendererStopped = false
                window.failure = ""
                web.reload()
            }
        }
    }
}
