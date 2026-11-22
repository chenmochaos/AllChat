#include <QDir>
#include <QGuiApplication>
#include <QIcon>
#include <QProcess>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QUrl>
#include <QtWebEngineQuick>

int main(int argc, char **argv)
{
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    app.setApplicationName("AllChat");
    app.setOrganizationName("AllChat");
    app.setDesktopFileName("allchat");
    app.setWindowIcon(QIcon(":/allchat.svg"));

    QQmlApplicationEngine engine;
    const QString root = QDir(QCoreApplication::applicationDirPath()).absoluteFilePath("../share/allchat");
    QProcess startup;
    engine.load(QUrl("qrc:/Main.qml"));
    if (engine.rootObjects().isEmpty()) return 1;
    QObject *window = engine.rootObjects().first();
    QObject::connect(&startup, &QProcess::finished, window, [&](int code, QProcess::ExitStatus status) {
        const QUrl url(QString::fromUtf8(startup.readAllStandardOutput()).trimmed());
        if (status == QProcess::NormalExit && code == 0 && url.scheme() == "http"
                && url.host() == "127.0.0.1" && url.port() > 0) {
            window->setProperty("workspaceUrl", url);
        } else {
            const auto error = QString::fromUtf8(startup.readAllStandardError()).trimmed();
            window->setProperty("failure", error.isEmpty() ? QObject::tr("无法启动本地工作区。") : error);
        }
    });
    QObject::connect(&startup, &QProcess::errorOccurred, window, [&](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) window->setProperty("failure", startup.errorString());
    });
    startup.start("/usr/bin/python3", {root + "/boot.py"});
    return app.exec();
}
