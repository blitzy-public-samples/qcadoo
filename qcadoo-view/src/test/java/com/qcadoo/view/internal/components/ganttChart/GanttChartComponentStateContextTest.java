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
import static org.junit.Assert.assertNull;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.Locale;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.qcadoo.localization.api.TranslationService;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemResolver;
import com.qcadoo.view.internal.ComponentDefinition;
import com.qcadoo.view.internal.ComponentOption;
import com.qcadoo.view.internal.api.InternalViewDefinition;

/**
 * Tests of {@link GanttChartComponentState#getContextValue(String)} on a state initialized from a request that carries only
 * a component context, or no context at all.
 */
public class GanttChartComponentStateContextTest {

    private static final String PLUGIN_IDENTIFIER = "testPlugin";

    private static final String VIEW_NAME = "testView";

    private static final String COMPONENT_NAME = "gantt";

    private static final String TRANSLATION_PATH = PLUGIN_IDENTIFIER + "." + VIEW_NAME + "." + COMPONENT_NAME;

    private static final String CONTEXT_KEY = "productionLineScheduleId";

    private static final String OTHER_CONTEXT_KEY = "orderId";

    @Mock
    private InternalViewDefinition viewDefinition;

    @Mock
    private TranslationService translationService;

    @Mock
    private GanttChartItemResolver resolver;

    @Before
    public final void init() {
        MockitoAnnotations.initMocks(this);

        when(viewDefinition.getPluginIdentifier()).thenReturn(PLUGIN_IDENTIFIER);
        when(viewDefinition.getName()).thenReturn(VIEW_NAME);
    }

    @Test
    public final void shouldReturnStringContextValue() throws Exception {
        // given
        GanttChartComponentState state = createStateWithContext(new JSONObject().put(CONTEXT_KEY, "12"));

        // when
        String value = state.getContextValue(CONTEXT_KEY);

        // then
        assertEquals("12", value);
    }

    @Test
    public final void shouldReturnTextOfNumericContextValue() throws Exception {
        // given
        GanttChartComponentState state = createStateWithContext(new JSONObject().put(CONTEXT_KEY, 12));

        // when
        String value = state.getContextValue(CONTEXT_KEY);

        // then
        assertEquals("12", value);
    }

    @Test
    public final void shouldReturnNullForMissingContextKey() throws Exception {
        // given
        GanttChartComponentState state = createStateWithContext(new JSONObject().put(OTHER_CONTEXT_KEY, "3"));

        // when
        String value = state.getContextValue(CONTEXT_KEY);

        // then
        assertNull(value);
    }

    @Test
    public final void shouldReturnNullForJsonNullContextValue() throws Exception {
        // given
        GanttChartComponentState state = createStateWithContext(new JSONObject().put(CONTEXT_KEY, JSONObject.NULL));

        // when
        String value = state.getContextValue(CONTEXT_KEY);

        // then
        assertNull(value);
    }

    @Test
    public final void shouldReturnNullWhenRequestCarriesNoContext() throws Exception {
        // given
        GanttChartComponentState state = createUninitializedState();
        state.initialize(new JSONObject(), Locale.ENGLISH);

        // when
        String value = state.getContextValue(CONTEXT_KEY);

        // then
        assertNull(value);
    }

    /**
     * Creates a state initialized in {@link Locale#ENGLISH} from a request whose only member is the given component context.
     */
    private GanttChartComponentState createStateWithContext(final JSONObject context) throws Exception {
        GanttChartComponentState state = createUninitializedState();

        JSONObject json = new JSONObject();
        json.put("context", context);

        state.initialize(json, Locale.ENGLISH);
        return state;
    }

    /**
     * Creates a pattern named {@code gantt} with the {@code resolver} option, and a state of it with the translation service,
     * translation path and name set, not yet initialized.
     */
    private GanttChartComponentState createUninitializedState() throws Exception {
        ComponentDefinition definition = new ComponentDefinition();
        definition.setName(COMPONENT_NAME);
        definition.setViewDefinition(viewDefinition);
        definition.setTranslationService(translationService);

        GanttChartComponentPattern pattern = new GanttChartComponentPattern(definition);
        pattern.addOption(new ComponentOption("resolver", Collections.singletonMap("value", GanttChartItemResolver.class
                .getName())));
        pattern.initializeComponent();

        GanttChartComponentState state = new GanttChartComponentState(resolver, pattern);
        state.setTranslationService(translationService);
        state.setTranslationPath(TRANSLATION_PATH);
        state.setName(COMPONENT_NAME);
        return state;
    }

}
