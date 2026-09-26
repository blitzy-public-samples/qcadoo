/**
 * ***************************************************************************
 * Copyright (c) 2010 Qcadoo Limited
 * Project: Qcadoo Framework
 * Version: 1.4
 *
 * This file is part of Qcadoo.
 *
 * Qcadoo is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation; either version 3 of the License,
 * or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty
 * of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 * ***************************************************************************
 */
package com.qcadoo.view.internal.components.ganttChart;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.Matchers.any;
import static org.mockito.Matchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Matchers;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.stubbing.Answer;

import com.qcadoo.localization.api.TranslationService;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemResolver;
import com.qcadoo.view.internal.ComponentDefinition;
import com.qcadoo.view.internal.ComponentOption;
import com.qcadoo.view.internal.api.InternalViewDefinition;
import com.qcadoo.view.internal.components.ganttChart.GanttChartScaleImpl.ZoomLevel;

/**
 * Tests of the item-move options of {@link GanttChartComponentPattern}: parsing of the {@code allowItemMove} view option; the
 * {@code allowItemMove}, {@code moveGridMinutes}, {@code zoomHoursIntervals} entries of the component's JavaScript options; its
 * {@code move.rejectedHeader}, {@code move.keyboardHelp}, {@code move.acceptedAnnouncement} and
 * {@code move.cancelledAnnouncement} translation entries; and the definition of the last three keys in every
 * {@code qcadooView} locale bundle.
 */
public class GanttChartComponentPatternTest {

    private static final String PLUGIN_IDENTIFIER = "testPlugin";

    private static final String VIEW_NAME = "testView";

    private static final String COMPONENT_NAME = "gantt";

    private static final String TRANSLATION_PATH = PLUGIN_IDENTIFIER + "." + VIEW_NAME + "." + COMPONENT_NAME;

    private static final String FALLBACK_TRANSLATION_PREFIX = "qcadooView.gantt.";

    private static final String REJECTED_HEADER_KEY = "move.rejectedHeader";

    private static final String KEYBOARD_HELP_KEY = "move.keyboardHelp";

    private static final String ACCEPTED_ANNOUNCEMENT_KEY = "move.acceptedAnnouncement";

    private static final String CANCELLED_ANNOUNCEMENT_KEY = "move.cancelledAnnouncement";

    /** Translation keys, relative to the component's translation path, of the keyboard move help and move announcements. */
    private static final String[] KEYBOARD_MOVE_AND_ANNOUNCEMENT_KEYS = { KEYBOARD_HELP_KEY, ACCEPTED_ANNOUNCEMENT_KEY,
            CANCELLED_ANNOUNCEMENT_KEY };

    /** Locale suffixes of the qcadooView locale bundles. */
    private static final String[] BUNDLE_LOCALES = { "en", "pl", "de", "fr", "cn" };

    private static final String BUNDLE_RESOURCE_PREFIX = "qcadooView/locales/qcadooView_";

    private static final String BUNDLE_RESOURCE_SUFFIX = ".properties";

    private static final String BUNDLE_ENCODING = "UTF-8";

    /** Placeholder that the client replaces with the move grid step, in minutes. */
    private static final String GRID_MINUTES_PLACEHOLDER = "{0}";

    @Mock
    private InternalViewDefinition viewDefinition;

    @Mock
    private TranslationService translationService;

    @Before
    public final void init() {
        MockitoAnnotations.initMocks(this);

        when(viewDefinition.getPluginIdentifier()).thenReturn(PLUGIN_IDENTIFIER);
        when(viewDefinition.getName()).thenReturn(VIEW_NAME);

        // The stubbed translation service answers every (code, secondCode, locale, args...) lookup with the secondCode,
        // i.e. the qcadooView.gantt.* fallback key.
        when(translationService.translate(anyString(), anyString(), any(Locale.class), Matchers.<String> anyVararg()))
                .thenAnswer(new Answer<String>() {

                    @Override
                    public String answer(final InvocationOnMock invocation) {
                        return (String) invocation.getArguments()[1];
                    }

                });
    }

    /**
     * Creates and initializes a Gantt chart pattern named {@code gantt} with the mandatory {@code resolver} option followed by
     * the given options.
     */
    private GanttChartComponentPattern createPattern(final ComponentOption... extraOptions) throws Exception {
        ComponentDefinition definition = new ComponentDefinition();
        definition.setName(COMPONENT_NAME);
        definition.setViewDefinition(viewDefinition);
        definition.setTranslationService(translationService);

        GanttChartComponentPattern pattern = new GanttChartComponentPattern(definition);

        pattern.addOption(new ComponentOption("resolver", Collections.singletonMap("value", GanttChartItemResolver.class
                .getName())));
        for (ComponentOption extraOption : extraOptions) {
            pattern.addOption(extraOption);
        }

        pattern.initializeComponent();

        return pattern;
    }

    /**
     * Initializes a pattern with the given option, fails the test when the initialization succeeds and otherwise returns the
     * {@link IllegalStateException} it threw.
     */
    private IllegalStateException initializeExpectingRejection(final ComponentOption option) throws Exception {
        IllegalStateException rejection = null;
        try {
            createPattern(option);
            fail("Gantt pattern accepted the allowItemMove value '" + option.getValue() + "'");
        } catch (IllegalStateException e) {
            rejection = e;
        }
        return rejection;
    }

    /**
     * Reads the qcadooView locale bundle of the given locale suffix from the test classpath as UTF-8, failing the test when the
     * bundle is missing.
     */
    private Properties loadBundle(final String localeSuffix) throws IOException {
        String resource = BUNDLE_RESOURCE_PREFIX + localeSuffix + BUNDLE_RESOURCE_SUFFIX;
        InputStream in = getClass().getClassLoader().getResourceAsStream(resource);
        assertNotNull("Missing locale bundle " + resource, in);

        Properties bundle = new Properties();
        Reader reader = new InputStreamReader(in, BUNDLE_ENCODING);
        try {
            bundle.load(reader);
        } finally {
            reader.close();
        }
        return bundle;
    }

    /**
     * Returns how many times the token occurs in the text, counting non-overlapping occurrences from the start.
     */
    private static int countOccurrences(final String text, final String token) {
        int count = 0;
        int index = text.indexOf(token);
        while (index >= 0) {
            count++;
            index = text.indexOf(token, index + token.length());
        }
        return count;
    }

    @Test
    public final void shouldDisableItemMoveByDefault() throws Exception {
        // given
        GanttChartComponentPattern pattern = createPattern();

        // when
        JSONObject jsOptions = pattern.getJsOptions(Locale.ENGLISH);

        // then
        assertFalse(pattern.isAllowItemMove());
        assertFalse(jsOptions.getBoolean("allowItemMove"));
    }

    @Test
    public final void shouldParseAllowItemMoveOption() throws Exception {
        // given
        GanttChartComponentPattern pattern = createPattern(new ComponentOption("allowItemMove", Collections.singletonMap(
                "value", "true")));

        // when
        JSONObject jsOptions = pattern.getJsOptions(Locale.ENGLISH);

        // then
        assertTrue(pattern.isAllowItemMove());
        assertTrue(jsOptions.getBoolean("allowItemMove"));
    }

    @Test
    public final void shouldParseExplicitlyDisabledAllowItemMoveOption() throws Exception {
        // given
        GanttChartComponentPattern pattern = createPattern(new ComponentOption("allowItemMove", Collections.singletonMap(
                "value", "false")));

        // when
        JSONObject jsOptions = pattern.getJsOptions(Locale.ENGLISH);

        // then
        assertFalse(pattern.isAllowItemMove());
        assertFalse(jsOptions.getBoolean("allowItemMove"));
    }

    @Test
    public final void shouldParseAllowItemMoveOptionIgnoringLetterCase() throws Exception {
        // given
        GanttChartComponentPattern pattern = createPattern(new ComponentOption("allowItemMove", Collections.singletonMap(
                "value", "TRUE")));

        // when
        JSONObject jsOptions = pattern.getJsOptions(Locale.ENGLISH);

        // then
        assertTrue(pattern.isAllowItemMove());
        assertTrue(jsOptions.getBoolean("allowItemMove"));
    }

    @Test
    public final void shouldRejectInvalidAllowItemMoveValue() throws Exception {
        // given
        ComponentOption option = new ComponentOption("allowItemMove", Collections.singletonMap("value", "treu"));

        // when
        IllegalStateException rejection = initializeExpectingRejection(option);

        // then
        assertTrue(rejection.getMessage().contains("'allowItemMove'"));
        assertTrue(rejection.getMessage().contains("'treu'"));
        assertEquals("Gantt option 'allowItemMove' must be 'true' or 'false', but was 'treu'", rejection.getMessage());
    }

    @Test
    public final void shouldRejectBlankAllowItemMoveValue() throws Exception {
        // given
        ComponentOption option = new ComponentOption("allowItemMove", Collections.singletonMap("value", ""));

        // when
        IllegalStateException rejection = initializeExpectingRejection(option);

        // then
        assertEquals("Gantt option 'allowItemMove' must be 'true' or 'false', but was ''", rejection.getMessage());
    }

    @Test
    public final void shouldRejectNullAllowItemMoveValue() throws Exception {
        // given
        ComponentOption option = new ComponentOption("allowItemMove", Collections.singletonMap("value", (String) null));

        // when
        IllegalStateException rejection = initializeExpectingRejection(option);

        // then
        assertEquals("Gantt option 'allowItemMove' must be 'true' or 'false', but was 'null'", rejection.getMessage());
    }

    @Test
    public final void shouldRejectAllowItemMoveOptionWithoutValueAttribute() throws Exception {
        // given
        // The view XML parser stores every attribute of <option type="allowItemMove" />, including "type", so the option's
        // only attribute is its type, and getValue() returns that attribute's value.
        ComponentOption option = new ComponentOption("allowItemMove", Collections.singletonMap("type", "allowItemMove"));

        // when
        IllegalStateException rejection = initializeExpectingRejection(option);

        // then
        assertEquals("Gantt option 'allowItemMove' must be 'true' or 'false', but was 'allowItemMove'", rejection.getMessage());
    }

    @Test
    public final void shouldExposeThirtyMinuteGridAndEveryZoomLevelInterval() throws Exception {
        // given
        GanttChartComponentPattern pattern = createPattern();

        // when
        JSONObject jsOptions = pattern.getJsOptions(Locale.ENGLISH);

        // then
        assertEquals(30, GanttChartComponentPattern.MOVE_GRID_MINUTES);
        assertEquals(GanttChartComponentPattern.MOVE_GRID_MINUTES, jsOptions.getInt("moveGridMinutes"));

        JSONObject intervals = jsOptions.getJSONObject("zoomHoursIntervals");
        assertEquals(ZoomLevel.values().length, intervals.length());
        for (ZoomLevel level : ZoomLevel.values()) {
            assertEquals(level.getHoursInterval(), intervals.getInt(level.name()));
        }
        Iterator<?> intervalNames = intervals.keys();
        while (intervalNames.hasNext()) {
            String intervalName = (String) intervalNames.next();
            assertNotNull(ZoomLevel.valueOf(intervalName));
        }

        JSONObject translations = jsOptions.getJSONObject("translations");
        assertEquals(FALLBACK_TRANSLATION_PREFIX + REJECTED_HEADER_KEY, translations.getString(REJECTED_HEADER_KEY));
        verify(translationService).translate(TRANSLATION_PATH + "." + REJECTED_HEADER_KEY,
                FALLBACK_TRANSLATION_PREFIX + REJECTED_HEADER_KEY, Locale.ENGLISH);

        assertTrue(jsOptions.getBoolean("hasPopupInfo"));
        assertTrue(jsOptions.getBoolean("allowDateSelection"));
        assertTrue(translations.has("header.label"));
    }

    @Test
    public final void shouldExposeKeyboardMoveAndAnnouncementTranslations() throws Exception {
        // given
        GanttChartComponentPattern movablePattern = createPattern(new ComponentOption("allowItemMove", Collections
                .singletonMap("value", "true")));
        GanttChartComponentPattern defaultPattern = createPattern();

        // when
        JSONObject movableTranslations = movablePattern.getJsOptions(Locale.ENGLISH).getJSONObject("translations");
        JSONObject defaultTranslations = defaultPattern.getJsOptions(Locale.ENGLISH).getJSONObject("translations");

        // then
        for (String key : KEYBOARD_MOVE_AND_ANNOUNCEMENT_KEYS) {
            assertEquals(FALLBACK_TRANSLATION_PREFIX + key, movableTranslations.getString(key));
            assertEquals(FALLBACK_TRANSLATION_PREFIX + key, defaultTranslations.getString(key));
            verify(translationService, times(2)).translate(TRANSLATION_PATH + "." + key, FALLBACK_TRANSLATION_PREFIX + key,
                    Locale.ENGLISH);
        }
    }

    @Test
    public final void shouldDefineKeyboardMoveAndAnnouncementTranslationsInEveryBundle() throws Exception {
        // given
        Map<String, Properties> bundles = new LinkedHashMap<String, Properties>();

        // when
        for (String localeSuffix : BUNDLE_LOCALES) {
            bundles.put(localeSuffix, loadBundle(localeSuffix));
        }

        // then
        assertEquals(BUNDLE_LOCALES.length, bundles.size());
        for (Map.Entry<String, Properties> entry : bundles.entrySet()) {
            String bundleName = "qcadooView_" + entry.getKey();
            Properties bundle = entry.getValue();
            for (String key : KEYBOARD_MOVE_AND_ANNOUNCEMENT_KEYS) {
                String bundleKey = FALLBACK_TRANSLATION_PREFIX + key;
                String value = bundle.getProperty(bundleKey);
                assertNotNull(bundleName + " lacks " + bundleKey, value);
                assertFalse(bundleName + " has a blank " + bundleKey, value.trim().isEmpty());
            }
            String keyboardHelp = bundle.getProperty(FALLBACK_TRANSLATION_PREFIX + KEYBOARD_HELP_KEY);
            assertEquals(bundleName + " " + FALLBACK_TRANSLATION_PREFIX + KEYBOARD_HELP_KEY + " must contain "
                    + GRID_MINUTES_PLACEHOLDER + " exactly once", 1, countOccurrences(keyboardHelp, GRID_MINUTES_PLACEHOLDER));
        }
    }

}
