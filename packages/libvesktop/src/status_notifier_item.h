#pragma once

#include <cstdint>
#include <gio/gio.h>
#include <memory>
#include <string>
#include <vector>
#include <map>
#include <functional>

template <typename T>
struct GObjectDeleter
{
    void operator()(T *obj) const
    {
        if (obj)
            g_object_unref(obj);
    }
};

template <typename T>
using GObjectPtr = std::unique_ptr<T, GObjectDeleter<T>>;

struct MenuItem
{
    int32_t id;
    std::string label;
    bool enabled;
    bool visible;
    bool is_separator;
};

class StatusNotifierItem
{
private:
    GObjectPtr<GDBusConnection> bus;
    guint registration_id = 0;
    guint menu_registration_id = 0;
    guint owner_id = 0;
    guint watcher_id = 0;
    bool registered_with_watcher = false;
    std::string service_name;
    std::string object_path;
    std::string menu_object_path = "/MenuBar";
    std::string current_status = "Active";
    std::string current_icon_path;
    std::string current_title = "Equibop";
    std::vector<uint8_t> current_icon_pixmap;
    std::vector<MenuItem> menu_items;
    uint32_t menu_revision = 1;
    std::function<void(int32_t)> menu_click_callback;
    std::function<void()> activate_callback;

    static constexpr const char *WATCHER_SERVICE = "org.kde.StatusNotifierWatcher";
    static constexpr const char *WATCHER_PATH = "/StatusNotifierWatcher";
    static constexpr const char *SNI_INTERFACE = "org.kde.StatusNotifierItem";
    static constexpr const char *DBUSMENU_INTERFACE = "com.canonical.dbusmenu";

    static const char *introspection_xml;
    static const char *menu_introspection_xml;

    static void handle_method_call(
        GDBusConnection *connection,
        const gchar *sender,
        const gchar *object_path,
        const gchar *interface_name,
        const gchar *method_name,
        GVariant *parameters,
        GDBusMethodInvocation *invocation,
        gpointer user_data);

    static GVariant *handle_get_property(
        GDBusConnection *connection,
        const gchar *sender,
        const gchar *object_path,
        const gchar *interface_name,
        const gchar *property_name,
        GError **error,
        gpointer user_data);

    static void handle_menu_method_call(
        GDBusConnection *connection,
        const gchar *sender,
        const gchar *object_path,
        const gchar *interface_name,
        const gchar *method_name,
        GVariant *parameters,
        GDBusMethodInvocation *invocation,
        gpointer user_data);

    static GVariant *handle_menu_get_property(
        GDBusConnection *connection,
        const gchar *sender,
        const gchar *object_path,
        const gchar *interface_name,
        const gchar *property_name,
        GError **error,
        gpointer user_data);

    static void on_watcher_name_changed(
        GDBusConnection *connection,
        const gchar *sender_name,
        const gchar *object_path,
        const gchar *interface_name,
        const gchar *signal_name,
        GVariant *parameters,
        gpointer user_data);

    bool register_with_watcher();
    bool register_menu();
    void subscribe_to_watcher();

public:
    StatusNotifierItem();
    ~StatusNotifierItem();

    bool initialize();
    bool set_icon_pixmap(const std::vector<uint8_t> &pixmap_data);
    bool set_title(const std::string &title);
    bool set_menu(const std::vector<MenuItem> &items);
    bool update_menu_item_label(int32_t id, const std::string &new_label);
    void set_menu_click_callback(std::function<void(int32_t)> callback);
    void set_activate_callback(std::function<void()> callback);
};
