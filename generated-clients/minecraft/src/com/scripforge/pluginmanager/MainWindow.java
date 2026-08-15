/*
 * ScripForge — ForgeClient Plugin Manager (Minecraft)
 * Component: MainWindow
 * Version: 1.0.0
 *
 * The application's main window: a toolbar, a table of discovered plugin
 * JARs, and a status bar, all wired to real PluginScanner / PluginActions logic.
 *
 * Standalone desktop tool for managing Bukkit/Spigot/Paper plugin JARs in a
 * server's plugins folder. Does not connect to or modify a running server.
 */

package com.scripforge.pluginmanager;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JFileChooser;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JToolBar;
import javax.swing.ListSelectionModel;
import javax.swing.SwingConstants;
import javax.swing.table.AbstractTableModel;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Builds and owns the main application window. Everything the toolbar
 * buttons do is implemented for real here: browsing to a plugins folder,
 * scanning it with {@link PluginScanner}, toggling enabled/disabled state
 * with {@link PluginActions}, and opening folders in the OS file explorer.
 */
public class MainWindow {

    /** Column indices, kept as constants so the table model and renderers agree. */
    private static final int COL_FILE_NAME = 0;
    private static final int COL_PLUGIN_NAME = 1;
    private static final int COL_VERSION = 2;
    private static final int COL_MAIN_CLASS = 3;
    private static final int COL_STATUS = 4;

    private static final String[] COLUMN_NAMES = {
            "File Name", "Plugin Name", "Version", "Main Class", "Status"
    };

    private final JFrame frame;
    private final PluginScanner scanner = new PluginScanner();
    private final PluginActions actions = new PluginActions();

    private final PluginTableModel tableModel = new PluginTableModel();
    private final JTable table = new JTable(tableModel);
    private final JLabel statusLabel = new JLabel("No folder selected. Use \"Open Plugins Folder...\" to begin.");

    private JButton enableButton;
    private JButton disableButton;
    private JButton openFolderButton;

    /** The plugins/ folder currently being displayed, or null if none chosen yet. */
    private Path currentFolder;

    public MainWindow() {
        frame = new JFrame("ScripForge ForgeClient Plugin Manager");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setSize(900, 520);
        frame.setLocationRelativeTo(null);

        frame.setLayout(new BorderLayout());
        frame.add(buildToolBar(), BorderLayout.NORTH);
        frame.add(buildTablePanel(), BorderLayout.CENTER);
        frame.add(buildStatusBar(), BorderLayout.SOUTH);

        // Selection changes should enable/disable the context-sensitive
        // buttons based on the selected row's current state.
        table.getSelectionModel().addListSelectionListener(e -> {
            if (!e.getValueIsAdjusting()) {
                updateButtonStates();
            }
        });

        updateButtonStates();
    }

    /** Makes the window visible. Must be called on the Swing Event Dispatch Thread. */
    public void show() {
        frame.setVisible(true);
    }

    // ------------------------------------------------------------------
    // UI construction
    // ------------------------------------------------------------------

    private JToolBar buildToolBar() {
        JToolBar toolBar = new JToolBar();
        toolBar.setFloatable(false);

        JButton openFolderChooserButton = new JButton("Open Plugins Folder...");
        openFolderChooserButton.addActionListener(e -> onChooseFolder());
        toolBar.add(openFolderChooserButton);

        JButton refreshButton = new JButton("Refresh");
        refreshButton.addActionListener(e -> onRefresh());
        toolBar.add(refreshButton);

        toolBar.addSeparator();

        enableButton = new JButton("Enable");
        enableButton.addActionListener(e -> onEnableSelected());
        toolBar.add(enableButton);

        disableButton = new JButton("Disable");
        disableButton.addActionListener(e -> onDisableSelected());
        toolBar.add(disableButton);

        toolBar.addSeparator();

        openFolderButton = new JButton("Open Containing Folder");
        openFolderButton.addActionListener(e -> onOpenContainingFolder());
        toolBar.add(openFolderButton);

        return toolBar;
    }

    private JPanel buildTablePanel() {
        table.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        table.setRowHeight(22);
        table.getColumnModel().getColumn(COL_FILE_NAME).setPreferredWidth(220);
        table.getColumnModel().getColumn(COL_PLUGIN_NAME).setPreferredWidth(160);
        table.getColumnModel().getColumn(COL_VERSION).setPreferredWidth(80);
        table.getColumnModel().getColumn(COL_MAIN_CLASS).setPreferredWidth(260);
        table.getColumnModel().getColumn(COL_STATUS).setPreferredWidth(80);

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.setPreferredSize(new Dimension(880, 400));

        JPanel panel = new JPanel(new BorderLayout());
        panel.add(scrollPane, BorderLayout.CENTER);
        return panel;
    }

    private JPanel buildStatusBar() {
        JPanel panel = new JPanel(new BorderLayout());
        panel.setBorder(BorderFactory.createEmptyBorder(4, 8, 4, 8));
        statusLabel.setHorizontalAlignment(SwingConstants.LEFT);
        panel.add(statusLabel, BorderLayout.WEST);
        return panel;
    }

    // ------------------------------------------------------------------
    // Event handlers
    // ------------------------------------------------------------------

    /** "Open Plugins Folder..." — lets the admin pick their server's plugins/ directory. */
    private void onChooseFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select your server's plugins folder");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        chooser.setAcceptAllFileFilterUsed(false);

        if (currentFolder != null) {
            chooser.setCurrentDirectory(currentFolder.toFile());
        }

        int result = chooser.showOpenDialog(frame);
        if (result == JFileChooser.APPROVE_OPTION) {
            currentFolder = chooser.getSelectedFile().toPath();
            frame.setTitle("ScripForge ForgeClient Plugin Manager — " + currentFolder);
            onRefresh();
        }
    }

    /** "Refresh" — re-scans the currently selected folder and repopulates the table. */
    private void onRefresh() {
        if (currentFolder == null) {
            statusLabel.setText("No folder selected. Use \"Open Plugins Folder...\" to begin.");
            return;
        }

        try {
            List<PluginInfo> plugins = scanner.scan(currentFolder);
            tableModel.setPlugins(plugins);

            if (plugins.isEmpty()) {
                // Empty-state text references how buyers actually get a JAR into this
                // folder: they compile one of ScripForge's .java plugin sources
                // (e.g. from generated-scripts/minecraft/*.java) into a JAR first.
                statusLabel.setText("No plugin JARs found in " + currentFolder
                        + ". Compile a ScripForge Minecraft script (.java) into a JAR and drop it here, then Refresh.");
            } else {
                long enabledCount = plugins.stream().filter(PluginInfo::isEnabled).count();
                statusLabel.setText(plugins.size() + " plugin(s) found in " + currentFolder
                        + " — " + enabledCount + " enabled, " + (plugins.size() - enabledCount) + " disabled.");
            }
        } catch (IOException ex) {
            statusLabel.setText("Failed to scan folder: " + ex.getMessage());
            JOptionPane.showMessageDialog(frame,
                    "Could not read the selected folder:\n" + ex.getMessage(),
                    "Scan Failed", JOptionPane.ERROR_MESSAGE);
        }

        updateButtonStates();
    }

    /** "Enable" — strips the ".disabled" suffix from the selected plugin's file. */
    private void onEnableSelected() {
        PluginInfo selected = getSelectedPlugin();
        if (selected == null || selected.isEnabled()) {
            return;
        }

        try {
            PluginInfo updated = actions.enable(selected);
            tableModel.replacePlugin(selected, updated);
            statusLabel.setText("Enabled " + updated.getFileName() + ".");
        } catch (IOException | IllegalStateException ex) {
            JOptionPane.showMessageDialog(frame,
                    "Could not enable \"" + selected.getFileName() + "\":\n" + ex.getMessage(),
                    "Enable Failed", JOptionPane.ERROR_MESSAGE);
        }

        updateButtonStates();
    }

    /** "Disable" — appends the ".disabled" suffix to the selected plugin's file. */
    private void onDisableSelected() {
        PluginInfo selected = getSelectedPlugin();
        if (selected == null || !selected.isEnabled()) {
            return;
        }

        try {
            PluginInfo updated = actions.disable(selected);
            tableModel.replacePlugin(selected, updated);
            statusLabel.setText("Disabled " + updated.getFileName() + ".");
        } catch (IOException | IllegalStateException ex) {
            JOptionPane.showMessageDialog(frame,
                    "Could not disable \"" + selected.getFileName() + "\":\n" + ex.getMessage(),
                    "Disable Failed", JOptionPane.ERROR_MESSAGE);
        }

        updateButtonStates();
    }

    /**
     * "Open Containing Folder" — reveals either the selected plugin's folder,
     * or (if nothing is selected) the currently scanned plugins folder itself,
     * in the OS file explorer.
     */
    private void onOpenContainingFolder() {
        try {
            PluginInfo selected = getSelectedPlugin();
            if (selected != null) {
                actions.openContainingFolder(selected);
            } else if (currentFolder != null) {
                actions.openFolder(currentFolder);
            } else {
                statusLabel.setText("No folder selected. Use \"Open Plugins Folder...\" first.");
                return;
            }
        } catch (IOException | UnsupportedOperationException ex) {
            JOptionPane.showMessageDialog(frame,
                    "Could not open the folder in your file explorer:\n" + ex.getMessage(),
                    "Open Folder Failed", JOptionPane.WARNING_MESSAGE);
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private PluginInfo getSelectedPlugin() {
        int viewRow = table.getSelectedRow();
        if (viewRow < 0) {
            return null;
        }
        int modelRow = table.convertRowIndexToModel(viewRow);
        return tableModel.getPluginAt(modelRow);
    }

    /** Enables/disables toolbar buttons based on whether a row is selected and its state. */
    private void updateButtonStates() {
        PluginInfo selected = getSelectedPlugin();
        enableButton.setEnabled(selected != null && !selected.isEnabled());
        disableButton.setEnabled(selected != null && selected.isEnabled());
        openFolderButton.setEnabled(currentFolder != null);
    }

    // ------------------------------------------------------------------
    // Table model
    // ------------------------------------------------------------------

    /**
     * A simple {@link AbstractTableModel} backed by a plain list of
     * {@link PluginInfo}. Kept as a private inner class since nothing outside
     * this window needs to touch it directly.
     */
    private static class PluginTableModel extends AbstractTableModel {

        private List<PluginInfo> plugins = new ArrayList<>();

        void setPlugins(List<PluginInfo> newPlugins) {
            this.plugins = new ArrayList<>(newPlugins);
            fireTableDataChanged();
        }

        PluginInfo getPluginAt(int row) {
            return plugins.get(row);
        }

        /** Swaps one row's data in place (used after an enable/disable rename) without a full rescan. */
        void replacePlugin(PluginInfo oldInfo, PluginInfo newInfo) {
            int index = plugins.indexOf(oldInfo);
            if (index >= 0) {
                plugins.set(index, newInfo);
                fireTableRowsUpdated(index, index);
            }
        }

        @Override
        public int getRowCount() {
            return plugins.size();
        }

        @Override
        public int getColumnCount() {
            return COLUMN_NAMES.length;
        }

        @Override
        public String getColumnName(int column) {
            return COLUMN_NAMES[column];
        }

        @Override
        public Object getValueAt(int rowIndex, int columnIndex) {
            PluginInfo plugin = plugins.get(rowIndex);
            switch (columnIndex) {
                case COL_FILE_NAME:
                    return plugin.getFileName();
                case COL_PLUGIN_NAME:
                    return plugin.getPluginName();
                case COL_VERSION:
                    return plugin.getVersion();
                case COL_MAIN_CLASS:
                    return plugin.getMainClass();
                case COL_STATUS:
                    return plugin.getStatusLabel();
                default:
                    return "";
            }
        }

        @Override
        public boolean isCellEditable(int rowIndex, int columnIndex) {
            return false;
        }
    }
}
