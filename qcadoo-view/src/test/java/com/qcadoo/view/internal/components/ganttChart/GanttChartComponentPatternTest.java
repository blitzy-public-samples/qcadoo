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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.Iterator;
import java.util.Locale;

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
 * Tests of the item-move options of {@link GanttChartComponentPattern}: parsing of the {@code allowItemMove} view option and
 * the {@code allowItemMove}, {@code moveGridMinutes}, {@code zoomHoursIntervals} and {@code move.rejectedHeader} entries of
 * the component's JavaScript options.
 */
public class GanttChartComponentPatternTest {

    private static final String PLUGIN_IDENTIFIER = "testPlugin";

    private static final String VIEW_NAME = "testView";

    private static final String COMPONENT_NAME = "gantt";

    private static final String TRANSLATION_PATH = PLUGIN_IDENTIFIER + "." + VIEW_NAME + "." + COMPONENT_NAME;

    private static final String FALLBACK_TRANSLATION_PREFIX = "qcadooView.gantt.";

    private static final String REJECTED_HEADER_KEY = "move.rejectedHeader";

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

}
