"""Request a local folder from the desktop portal in its own GUI process."""
import os
os.environ["GTK_USE_PORTAL"] = "1"
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

picker = Gtk.FileChooserNative.new("选择 AllChat 项目文件夹", None,
                                   Gtk.FileChooserAction.SELECT_FOLDER, "添加", "取消")
picker.set_local_only(True)
if picker.run() == Gtk.ResponseType.ACCEPT:
    print(picker.get_filename() or "")
picker.destroy()
