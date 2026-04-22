#include "status_notifier_item.h"
#include <iostream>
#include <cstring>
#include <unistd.h>

struct GVariantDeleter
{
    void operator()(GVariant *variant) const
    {
        if (variant)
            g_variant_unref(variant);
    }
};

using GVariantPtr = std::unique_ptr<GVariant, GVariantDeleter>;

struct GErrorDeleter
{
    void operator()(GError *error) const
    {
        if (error)
            g_error_free(error);
    }
};

using GErrorPtr = std::unique_ptr<GError, GErrorDeleter>;

const char *StatusNotifierItem::introspection_xml = R"XML(
<node>
  <interface name="org.kde.StatusNotifierItem">
    <property name="Category" type="s" access="read"/>
    <property name="Id" type="s" access="read"/>
    <property name="Title" type="s" access="read"/>
    <property name="Status" type="s" access="read"/>
    <property name="IconName" type="s" access="read"/>
    <property name="IconPixmap" type="a(iiay)" access="read"/>
    <property name="AttentionIconName" type="s" access="read"/>
    <property name="ToolTip" type="(sa(iiay)ss)" access="read"/>
    <property name="ItemIsMenu" type="b" access="read"/>
    <property name="Menu" type="o" access="read"/>
    <method name="Activate">
      <arg type="i" name="x" direction="in"/>
      <arg type="i" name="y" direction="in"/>
    </method>
    <method name="SecondaryActivate">
      <arg type="i" name="x" direction="in"/>
      <arg type="i" name="y" direction="in"/>
    </method>
    <method name="ContextMenu">
      <arg type="i" name="x" direction="in"/>
      <arg type="i" name="y" direction="in"/>
    </method>
    <method name="Scroll">
      <arg type="i" name="delta" direction="in"/>
      <arg type="s" name="orientation" direction="in"/>
    </method>
    <signal name="NewIcon"/>
    <signal name="NewTitle"/>
    <signal name="NewStatus">
      <arg type="s" name="status"/>
    </signal>
  </interface>
</node>
)XML";

const char *StatusNotifierItem::menu_introspection_xml = R"XML(
<node>
  <interface name="com.canonical.dbusmenu">
    <method name="GetLayout">
      <arg type="i" name="parentId" direction="in"/>
      <arg type="i" name="recursionDepth" direction="in"/>
      <arg type="as" name="propertyNames" direction="in"/>
      <arg type="u" name="revision" direction="out"/>
      <arg type="(ia{sv}av)" name="layout" direction="out"/>
    </method>
    <method name="GetGroupProperties">
      <arg type="ai" name="ids" direction="in"/>
      <arg type="as" name="propertyNames" direction="in"/>
      <arg type="a(ia{sv})" name="properties" direction="out"/>
    </method>
    <method name="GetProperty">
      <arg type="i" name="id" direction="in"/>
      <arg type="s" name="name" direction="in"/>
      <arg type="v" name="value" direction="out"/>
    </method>
    <method name="Event">
      <arg type="i" name="id" direction="in"/>
      <arg type="s" name="eventId" direction="in"/>
      <arg type="v" name="data" direction="in"/>
      <arg type="u" name="timestamp" direction="in"/>
    </method>
    <method name="EventGroup">
      <arg type="a(isvu)" name="events" direction="in"/>
      <arg type="ai" name="idErrors" direction="out"/>
    </method>
    <method name="AboutToShow">
      <arg type="i" name="id" direction="in"/>
      <arg type="b" name="needUpdate" direction="out"/>
    </method>
    <method name="AboutToShowGroup">
      <arg type="ai" name="ids" direction="in"/>
      <arg type="ai" name="updatesNeeded" direction="out"/>
      <arg type="ai" name="idErrors" direction="out"/>
    </method>
    <signal name="ItemsPropertiesUpdated">
      <arg type="a(ia{sv})" name="updatedProps"/>
      <arg type="a(ias)" name="removedProps"/>
    </signal>
    <signal name="LayoutUpdated">
      <arg type="u" name="revision"/>
      <arg type="i" name="parent"/>
    </signal>
    <signal name="ItemActivationRequested">
      <arg type="i" name="id"/>
      <arg type="u" name="timestamp"/>
    </signal>
    <property name="Version" type="u" access="read"/>
    <property name="TextDirection" type="s" access="read"/>
    <property name="Status" type="s" access="read"/>
    <property name="IconThemePath" type="as" access="read"/>
  </interface>
</node>
)XML";

void StatusNotifierItem::handle_method_call(
    GDBusConnection *connection,
    const gchar *sender,
    const gchar *object_path,
    const gchar *interface_name,
    const gchar *method_name,
    GVariant *parameters,
    GDBusMethodInvocation *invocation,
    gpointer user_data)
{
    (void)connection;
    (void)sender;
    (void)object_path;
    (void)interface_name;
    (void)parameters;

    auto *self = static_cast<StatusNotifierItem *>(user_data);

    if (g_strcmp0(method_name, "Activate") == 0)
    {
        if (self->activate_callback)
        {
            self->activate_callback();
        }
        g_dbus_method_invocation_return_value(invocation, nullptr);
    }
    else if (g_strcmp0(method_name, "SecondaryActivate") == 0)
    {
        g_dbus_method_invocation_return_value(invocation, nullptr);
    }
    else if (g_strcmp0(method_name, "ContextMenu") == 0)
    {
        g_dbus_method_invocation_return_value(invocation, nullptr);
    }
    else if (g_strcmp0(method_name, "Scroll") == 0)
    {
        g_dbus_method_invocation_return_value(invocation, nullptr);
    }
}

GVariant *StatusNotifierItem::handle_get_property(
    GDBusConnection *connection,
    const gchar *sender,
    const gchar *object_path,
    const gchar *interface_name,
    const gchar *property_name,
    GError **error,
    gpointer user_data)
{
    auto *self = static_cast<StatusNotifierItem *>(user_data);

    if (g_strcmp0(property_name, "Category") == 0)
    {
        return g_variant_new_string("Communications");
    }
    else if (g_strcmp0(property_name, "Id") == 0)
    {
        return g_variant_new_string("equibop");
    }
    else if (g_strcmp0(property_name, "Title") == 0)
    {
        return g_variant_new_string(self->current_title.c_str());
    }
    else if (g_strcmp0(property_name, "Status") == 0)
    {
        return g_variant_new_string(self->current_status.c_str());
    }
    else if (g_strcmp0(property_name, "IconName") == 0)
    {
        return g_variant_new_string("");
    }
    else if (g_strcmp0(property_name, "IconPixmap") == 0)
    {
        if (!self->current_icon_pixmap.empty() && self->current_icon_pixmap.size() >= 8)
        {
            GVariantBuilder builder;
            g_variant_builder_init(&builder, G_VARIANT_TYPE("a(iiay)"));

            int width, height;
            memcpy(&width, self->current_icon_pixmap.data(), 4);
            memcpy(&height, self->current_icon_pixmap.data() + 4, 4);

            GVariantBuilder data_builder;
            g_variant_builder_init(&data_builder, G_VARIANT_TYPE("ay"));

            for (size_t i = 8; i < self->current_icon_pixmap.size(); i++)
            {
                g_variant_builder_add(&data_builder, "y", self->current_icon_pixmap[i]);
            }

            g_variant_builder_add(&builder, "(ii@ay)",
                width,
                height,
                g_variant_builder_end(&data_builder));

            return g_variant_builder_end(&builder);
        }
        return g_variant_new_array(G_VARIANT_TYPE("(iiay)"), nullptr, 0);
    }
    else if (g_strcmp0(property_name, "AttentionIconName") == 0)
    {
        return g_variant_new_string("");
    }
    else if (g_strcmp0(property_name, "ToolTip") == 0)
    {
        GVariantBuilder builder;
        g_variant_builder_init(&builder, G_VARIANT_TYPE("(sa(iiay)ss)"));
        g_variant_builder_add(&builder, "s", "equibop");
        g_variant_builder_open(&builder, G_VARIANT_TYPE("a(iiay)"));
        g_variant_builder_close(&builder);
        g_variant_builder_add(&builder, "s", self->current_title.c_str());
        g_variant_builder_add(&builder, "s", "");
        return g_variant_builder_end(&builder);
    }
    else if (g_strcmp0(property_name, "ItemIsMenu") == 0)
    {
        return g_variant_new_boolean(FALSE);
    }
    else if (g_strcmp0(property_name, "Menu") == 0)
    {
        return g_variant_new_object_path(self->menu_object_path.c_str());
    }

    return nullptr;
}

void StatusNotifierItem::handle_menu_method_call(
    GDBusConnection *connection,
    const gchar *sender,
    const gchar *object_path,
    const gchar *interface_name,
    const gchar *method_name,
    GVariant *parameters,
    GDBusMethodInvocation *invocation,
    gpointer user_data)
{
    (void)connection;
    (void)sender;
    (void)object_path;
    (void)interface_name;

    auto *self = static_cast<StatusNotifierItem *>(user_data);

    if (g_strcmp0(method_name, "GetLayout") == 0)
    {
        gint32 parent_id;
        gint32 recursion_depth;
        GVariantIter *property_names_iter;
        g_variant_get(parameters, "(iias)", &parent_id, &recursion_depth, &property_names_iter);
        g_variant_iter_free(property_names_iter);

        GVariantBuilder layout_builder;
        g_variant_builder_init(&layout_builder, G_VARIANT_TYPE("(ia{sv}av)"));

        g_variant_builder_add(&layout_builder, "i", 0);

        GVariantBuilder props_builder;
        g_variant_builder_init(&props_builder, G_VARIANT_TYPE("a{sv}"));
        g_variant_builder_add(&layout_builder, "a{sv}", &props_builder);

        GVariantBuilder children_builder;
        g_variant_builder_init(&children_builder, G_VARIANT_TYPE("av"));

        for (const auto &item : self->menu_items)
        {

            GVariantBuilder item_builder;
            g_variant_builder_init(&item_builder, G_VARIANT_TYPE("(ia{sv}av)"));

            g_variant_builder_add(&item_builder, "i", item.id);

            GVariantBuilder item_props_builder;
            g_variant_builder_init(&item_props_builder, G_VARIANT_TYPE("a{sv}"));

            if (item.is_separator)
            {
                g_variant_builder_add(&item_props_builder, "{sv}", "type", g_variant_new_string("separator"));
                g_variant_builder_add(&item_props_builder, "{sv}", "visible", g_variant_new_boolean(item.visible));
            }
            else
            {
                g_variant_builder_add(&item_props_builder, "{sv}", "label", g_variant_new_string(item.label.c_str()));
                g_variant_builder_add(&item_props_builder, "{sv}", "enabled", g_variant_new_boolean(item.enabled));
                g_variant_builder_add(&item_props_builder, "{sv}", "visible", g_variant_new_boolean(item.visible));
                g_variant_builder_add(&item_props_builder, "{sv}", "toggle-type", g_variant_new_string(""));
            }

            g_variant_builder_add(&item_builder, "a{sv}", &item_props_builder);

            GVariantBuilder empty_children;
            g_variant_builder_init(&empty_children, G_VARIANT_TYPE("av"));
            g_variant_builder_add(&item_builder, "av", &empty_children);

            g_variant_builder_add(&children_builder, "v", g_variant_builder_end(&item_builder));
        }

        g_variant_builder_add(&layout_builder, "av", &children_builder);

        g_dbus_method_invocation_return_value(invocation,
            g_variant_new("(u@(ia{sv}av))", self->menu_revision, g_variant_builder_end(&layout_builder)));
    }
    else if (g_strcmp0(method_name, "Event") == 0)
    {
        gint32 id;
        const gchar *event_id;
        GVariant *data;
        guint32 timestamp;
        g_variant_get(parameters, "(isvu)", &id, &event_id, &data, &timestamp);

        if (g_strcmp0(event_id, "clicked") == 0)
        {
            if (self->menu_click_callback)
            {
                self->menu_click_callback(id);
            }
        }

        g_variant_unref(data);
        g_dbus_method_invocation_return_value(invocation, nullptr);
    }
    else if (g_strcmp0(method_name, "EventGroup") == 0)
    {
        GVariantIter *events_iter;
        g_variant_get(parameters, "(a(isvu))", &events_iter);

        GVariantBuilder errors_builder;
        g_variant_builder_init(&errors_builder, G_VARIANT_TYPE("ai"));

        gint32 id;
        const gchar *event_id;
        GVariant *data;
        guint32 timestamp;

        while (g_variant_iter_next(events_iter, "(isvu)", &id, &event_id, &data, &timestamp))
        {
            if (g_strcmp0(event_id, "clicked") == 0)
            {
                if (self->menu_click_callback)
                {
                    self->menu_click_callback(id);
                }
            }
            g_variant_unref(data);
        }

        g_variant_iter_free(events_iter);
        g_dbus_method_invocation_return_value(invocation,
            g_variant_new("(@ai)", g_variant_builder_end(&errors_builder)));
    }
    else if (g_strcmp0(method_name, "AboutToShow") == 0)
    {
        g_dbus_method_invocation_return_value(invocation, g_variant_new("(b)", TRUE));
    }
    else if (g_strcmp0(method_name, "AboutToShowGroup") == 0)
    {
        GVariantIter *ids_iter;
        g_variant_get(parameters, "(ai)", &ids_iter);
        g_variant_iter_free(ids_iter);

        GVariantBuilder updates_builder;
        g_variant_builder_init(&updates_builder, G_VARIANT_TYPE("ai"));

        GVariantBuilder errors_builder;
        g_variant_builder_init(&errors_builder, G_VARIANT_TYPE("ai"));

        g_dbus_method_invocation_return_value(invocation,
            g_variant_new("(@ai@ai)", g_variant_builder_end(&updates_builder), g_variant_builder_end(&errors_builder)));
    }
    else if (g_strcmp0(method_name, "GetGroupProperties") == 0)
    {
        GVariantIter *ids_iter;
        GVariantIter *property_names_iter;
        g_variant_get(parameters, "(aias)", &ids_iter, &property_names_iter);

        std::vector<int32_t> requested_ids;
        gint32 id;
        while (g_variant_iter_next(ids_iter, "i", &id))
        {
            requested_ids.push_back(id);
        }

        g_variant_iter_free(ids_iter);
        g_variant_iter_free(property_names_iter);

        GVariantBuilder props_builder;
        g_variant_builder_init(&props_builder, G_VARIANT_TYPE("a(ia{sv})"));

        bool root_requested = false;
        for (auto rid : requested_ids)
        {
            if (rid == 0)
            {
                root_requested = true;
                break;
            }
        }

        if (root_requested || requested_ids.empty())
        {
            GVariantBuilder root_builder;
            g_variant_builder_init(&root_builder, G_VARIANT_TYPE("(ia{sv})"));
            g_variant_builder_add(&root_builder, "i", 0);

            GVariantBuilder root_props;
            g_variant_builder_init(&root_props, G_VARIANT_TYPE("a{sv}"));
            g_variant_builder_add(&root_props, "{sv}", "children-display", g_variant_new_string("submenu"));

            g_variant_builder_add(&root_builder, "@a{sv}", g_variant_builder_end(&root_props));
            g_variant_builder_add(&props_builder, "@(ia{sv})", g_variant_builder_end(&root_builder));
        }

        for (const auto &item : self->menu_items)
        {
            if (!requested_ids.empty())
            {
                bool found = false;
                for (auto req_id : requested_ids)
                {
                    if (req_id == item.id)
                    {
                        found = true;
                        break;
                    }
                }
                if (!found)
                {
                    continue;
                }
            }

            GVariantBuilder item_builder;
            g_variant_builder_init(&item_builder, G_VARIANT_TYPE("(ia{sv})"));
            g_variant_builder_add(&item_builder, "i", item.id);

            GVariantBuilder item_props;
            g_variant_builder_init(&item_props, G_VARIANT_TYPE("a{sv}"));

            if (item.is_separator)
            {
                g_variant_builder_add(&item_props, "{sv}", "type", g_variant_new_string("separator"));
                g_variant_builder_add(&item_props, "{sv}", "visible", g_variant_new_boolean(item.visible));
            }
            else
            {
                g_variant_builder_add(&item_props, "{sv}", "label", g_variant_new_string(item.label.c_str()));
                g_variant_builder_add(&item_props, "{sv}", "enabled", g_variant_new_boolean(item.enabled));
                g_variant_builder_add(&item_props, "{sv}", "visible", g_variant_new_boolean(item.visible));
                g_variant_builder_add(&item_props, "{sv}", "toggle-type", g_variant_new_string(""));
            }

            g_variant_builder_add(&item_builder, "@a{sv}", g_variant_builder_end(&item_props));
            g_variant_builder_add(&props_builder, "@(ia{sv})", g_variant_builder_end(&item_builder));

        }

        g_dbus_method_invocation_return_value(invocation, g_variant_new("(@a(ia{sv}))", g_variant_builder_end(&props_builder)));
    }
    else if (g_strcmp0(method_name, "GetProperty") == 0)
    {
        g_dbus_method_invocation_return_value(invocation, g_variant_new("(v)", g_variant_new_string("")));
    }
}

GVariant *StatusNotifierItem::handle_menu_get_property(
    GDBusConnection *connection,
    const gchar *sender,
    const gchar *object_path,
    const gchar *interface_name,
    const gchar *property_name,
    GError **error,
    gpointer user_data)
{
    (void)connection;
    (void)sender;
    (void)object_path;
    (void)interface_name;
    (void)error;
    (void)user_data;

    if (g_strcmp0(property_name, "Version") == 0)
    {
        return g_variant_new_uint32(3);
    }
    else if (g_strcmp0(property_name, "TextDirection") == 0)
    {
        return g_variant_new_string("ltr");
    }
    else if (g_strcmp0(property_name, "Status") == 0)
    {
        return g_variant_new_string("normal");
    }
    else if (g_strcmp0(property_name, "IconThemePath") == 0)
    {
        GVariantBuilder builder;
        g_variant_builder_init(&builder, G_VARIANT_TYPE("as"));
        return g_variant_builder_end(&builder);
    }

    return nullptr;
}

StatusNotifierItem::StatusNotifierItem()
{
    GError *error = nullptr;
    bus.reset(g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, &error));

    if (!bus)
    {
        GErrorPtr error_ptr(error);
        return;
    }

    service_name = "org.equicord.equibop.StatusNotifierItem";
    object_path = "/StatusNotifierItem";
}

StatusNotifierItem::~StatusNotifierItem()
{
    if (bus)
    {
        if (watcher_id != 0)
        {
            g_dbus_connection_signal_unsubscribe(bus.get(), watcher_id);
        }
        if (menu_registration_id != 0)
        {
            g_dbus_connection_unregister_object(bus.get(), menu_registration_id);
        }
        if (registration_id != 0)
        {
            g_dbus_connection_unregister_object(bus.get(), registration_id);
        }
        if (owner_id != 0)
        {
            g_bus_unown_name(owner_id);
        }
    }
}

bool StatusNotifierItem::initialize()
{
    if (!bus)
        return false;

    GError *error = nullptr;

    static GDBusInterfaceVTable vtable = {
        handle_method_call,
        handle_get_property,
        nullptr,
        {}
    };

    GDBusNodeInfo *node_info = g_dbus_node_info_new_for_xml(introspection_xml, &error);
    if (!node_info)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    registration_id = g_dbus_connection_register_object(
        bus.get(),
        object_path.c_str(),
        node_info->interfaces[0],
        &vtable,
        this,
        nullptr,
        &error);

    g_dbus_node_info_unref(node_info);

    if (registration_id == 0)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    GBusNameOwnerFlags flags = static_cast<GBusNameOwnerFlags>(
        G_BUS_NAME_OWNER_FLAGS_ALLOW_REPLACEMENT | G_BUS_NAME_OWNER_FLAGS_REPLACE);

    owner_id = g_bus_own_name_on_connection(
        bus.get(),
        service_name.c_str(),
        flags,
        nullptr,
        nullptr,
        nullptr,
        nullptr);

    if (owner_id == 0)
    {
        return false;
    }

    subscribe_to_watcher();

    return true;
}

bool StatusNotifierItem::register_with_watcher()
{
    if (!bus || registered_with_watcher)
        return true;

    GError *error = nullptr;

    const gchar *unique_name = g_dbus_connection_get_unique_name(bus.get());
    const char *register_name = unique_name ? unique_name : service_name.c_str();

    GVariantPtr reply(g_dbus_connection_call_sync(
        bus.get(),
        WATCHER_SERVICE,
        WATCHER_PATH,
        WATCHER_SERVICE,
        "RegisterStatusNotifierItem",
        g_variant_new("(s)", register_name),
        nullptr,
        G_DBUS_CALL_FLAGS_NONE,
        -1,
        nullptr,
        &error));

    if (!reply)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    g_dbus_connection_emit_signal(
        bus.get(),
        nullptr,
        object_path.c_str(),
        SNI_INTERFACE,
        "NewStatus",
        g_variant_new("(s)", "Active"),
        nullptr);

    registered_with_watcher = true;
    return true;
}

bool StatusNotifierItem::set_icon_pixmap(const std::vector<uint8_t> &pixmap_data)
{
    if (!bus)
        return false;

    current_icon_pixmap = pixmap_data;

    if (!registered_with_watcher)
    {
        if (!register_with_watcher())
        {
            return false;
        }
    }
    else
    {
        GError *error = nullptr;
        gboolean result = g_dbus_connection_emit_signal(
            bus.get(),
            nullptr,
            object_path.c_str(),
            SNI_INTERFACE,
            "NewIcon",
            nullptr,
            &error);

        if (!result || error)
        {
            GErrorPtr error_ptr(error);
            return false;
        }
    }

    return true;
}

bool StatusNotifierItem::set_title(const std::string &title)
{
    if (!bus || title == current_title)
        return true;

    current_title = title;

    GError *error = nullptr;
    gboolean result = g_dbus_connection_emit_signal(
        bus.get(),
        nullptr,
        object_path.c_str(),
        SNI_INTERFACE,
        "NewTitle",
        nullptr,
        &error);

    if (!result || error)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    return true;
}

bool StatusNotifierItem::register_menu()
{
    if (!bus || menu_registration_id != 0)
    {
        return true;
    }

    GError *error = nullptr;

    static GDBusInterfaceVTable menu_vtable = {
        handle_menu_method_call,
        handle_menu_get_property,
        nullptr,
        {}
    };

    GDBusNodeInfo *node_info = g_dbus_node_info_new_for_xml(menu_introspection_xml, &error);
    if (!node_info)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    menu_registration_id = g_dbus_connection_register_object(
        bus.get(),
        menu_object_path.c_str(),
        node_info->interfaces[0],
        &menu_vtable,
        this,
        nullptr,
        &error);

    g_dbus_node_info_unref(node_info);

    if (menu_registration_id == 0)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    return true;
}

bool StatusNotifierItem::set_menu(const std::vector<MenuItem> &items)
{
    if (!bus)
        return false;

    menu_items = items;
    menu_revision++;

    if (!register_menu())
    {
        return false;
    }

    GError *error = nullptr;
    gboolean result = g_dbus_connection_emit_signal(
        bus.get(),
        nullptr,
        menu_object_path.c_str(),
        DBUSMENU_INTERFACE,
        "LayoutUpdated",
        g_variant_new("(ui)", menu_revision, 0),
        &error);

    if (!result || error)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    return true;
}

bool StatusNotifierItem::update_menu_item_label(int32_t id, const std::string &new_label)
{
    if (!bus)
        return false;

    bool found = false;
    for (auto &item : menu_items)
    {
        if (item.id == id)
        {
            item.label = new_label;
            found = true;
            break;
        }
    }

    if (!found)
        return false;

    menu_revision++;

    GVariantBuilder updated_props_builder;
    g_variant_builder_init(&updated_props_builder, G_VARIANT_TYPE("a(ia{sv})"));

    GVariantBuilder item_builder;
    g_variant_builder_init(&item_builder, G_VARIANT_TYPE("(ia{sv})"));
    g_variant_builder_add(&item_builder, "i", id);

    GVariantBuilder props_builder;
    g_variant_builder_init(&props_builder, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&props_builder, "{sv}", "label", g_variant_new_string(new_label.c_str()));

    g_variant_builder_add(&item_builder, "@a{sv}", g_variant_builder_end(&props_builder));
    g_variant_builder_add(&updated_props_builder, "@(ia{sv})", g_variant_builder_end(&item_builder));

    GVariantBuilder removed_props_builder;
    g_variant_builder_init(&removed_props_builder, G_VARIANT_TYPE("a(ias)"));

    GError *error = nullptr;
    gboolean result = g_dbus_connection_emit_signal(
        bus.get(),
        nullptr,
        menu_object_path.c_str(),
        DBUSMENU_INTERFACE,
        "ItemsPropertiesUpdated",
        g_variant_new("(@a(ia{sv})@a(ias))",
                      g_variant_builder_end(&updated_props_builder),
                      g_variant_builder_end(&removed_props_builder)),
        &error);

    if (!result || error)
    {
        GErrorPtr error_ptr(error);
        return false;
    }

    return true;
}

void StatusNotifierItem::set_menu_click_callback(std::function<void(int32_t)> callback)
{
    menu_click_callback = callback;
}

void StatusNotifierItem::set_activate_callback(std::function<void()> callback)
{
    activate_callback = callback;
}

void StatusNotifierItem::on_watcher_name_changed(
    GDBusConnection *connection,
    const gchar *sender_name,
    const gchar *object_path,
    const gchar *interface_name,
    const gchar *signal_name,
    GVariant *parameters,
    gpointer user_data)
{
    (void)connection;
    (void)sender_name;
    (void)object_path;
    (void)interface_name;
    (void)signal_name;

    auto *self = static_cast<StatusNotifierItem *>(user_data);

    const gchar *name;
    const gchar *old_owner;
    const gchar *new_owner;
    g_variant_get(parameters, "(&s&s&s)", &name, &old_owner, &new_owner);

    if (g_strcmp0(name, WATCHER_SERVICE) != 0)
        return;

    if (new_owner && new_owner[0] != '\0')
    {
        self->registered_with_watcher = false;
        self->register_with_watcher();
    }
    else
    {
        self->registered_with_watcher = false;
    }
}

void StatusNotifierItem::subscribe_to_watcher()
{
    if (!bus || watcher_id != 0)
        return;

    watcher_id = g_dbus_connection_signal_subscribe(
        bus.get(),
        "org.freedesktop.DBus",
        "org.freedesktop.DBus",
        "NameOwnerChanged",
        "/org/freedesktop/DBus",
        WATCHER_SERVICE,
        G_DBUS_SIGNAL_FLAGS_NONE,
        on_watcher_name_changed,
        this,
        nullptr);
}
