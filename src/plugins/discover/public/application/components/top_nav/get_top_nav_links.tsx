/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import React from 'react';
import { EuiText } from '@elastic/eui';
import { DiscoverViewServices } from '../../../build_services';
import { SavedSearch } from '../../../saved_searches';
import { Adapters } from '../../../../../inspector/public';
import { TopNavMenuData } from '../../../../../navigation/public';
import { ISearchSource, unhashUrl } from '../../../opensearch_dashboards_services';
import {
  OnSaveProps,
  SavedObjectSaveModal,
  showSaveModal,
} from '../../../../../saved_objects/public';
import {
  OpenSearchDashboardsContextProvider,
  toMountPoint,
} from '../../../../../opensearch_dashboards_react/public';
import { DiscoverState, setSavedSearchId } from '../../utils/state_management';
import { DOC_HIDE_TIME_COLUMN_SETTING, SORT_DEFAULT_ORDER_SETTING } from '../../../../common';
import { getSortForSearchSource } from '../../view_components/utils/get_sort_for_search_source';
import { getRootBreadcrumbs } from '../../helpers/breadcrumbs';
import { syncQueryStateWithUrl } from '../../../../../data/public';
import { getNewDiscoverSetting, setNewDiscoverSetting } from '../utils/local_storage';
import { OpenSearchPanel } from './open_search_panel';

export const getTopNavLinks = (
  services: DiscoverViewServices,
  inspectorAdapters: Adapters,
  savedSearch: SavedSearch
) => {
  const {
    history,
    inspector,
    core,
    capabilities,
    share,
    toastNotifications,
    chrome,
    store,
    data: { query },
    osdUrlStateStorage,
    storage,
  } = services;

  const newSearch = {
    id: 'new',
    label: i18n.translate('discover.localMenu.localMenu.newSearchTitle', {
      defaultMessage: 'New',
    }),
    description: i18n.translate('discover.localMenu.newSearchDescription', {
      defaultMessage: 'New Search',
    }),
    run() {
      core.application.navigateToApp('discover', {
        path: '#/',
      });
    },
    testId: 'discoverNewButton',
  };

  const saveSearch: TopNavMenuData = {
    id: 'save',
    label: i18n.translate('discover.localMenu.saveTitle', {
      defaultMessage: 'Save',
    }),
    description: i18n.translate('discover.localMenu.saveSearchDescription', {
      defaultMessage: 'Save Search',
    }),
    testId: 'discoverSaveButton',
    run: async () => {
      const onSave = async ({
        newTitle,
        newCopyOnSave,
        isTitleDuplicateConfirmed,
        onTitleDuplicate,
      }: OnSaveProps) => {
        const currentTitle = savedSearch.title;
        savedSearch.title = newTitle;
        savedSearch.copyOnSave = newCopyOnSave;
        const saveOptions = {
          confirmOverwrite: false,
          isTitleDuplicateConfirmed,
          onTitleDuplicate,
        };

        const state: DiscoverState = store!.getState().discover; // store is defined before the view is loaded

        savedSearch.columns = state.columns;
        savedSearch.sort = state.sort;

        try {
          const id = await savedSearch.save(saveOptions);

          // If the title is a duplicate, the id will be an empty string. Checking for this condition here
          if (id) {
            toastNotifications.addSuccess({
              title: i18n.translate('discover.notifications.savedSearchTitle', {
                defaultMessage: `Search '{savedSearchTitle}' was saved`,
                values: {
                  savedSearchTitle: savedSearch.title,
                },
              }),
              'data-test-subj': 'saveSearchSuccess',
            });

            if (id !== state.savedSearch) {
              history().push(`/view/${encodeURIComponent(id)}`);
            } else {
              chrome.docTitle.change(savedSearch.lastSavedTitle);
              chrome.setBreadcrumbs([...getRootBreadcrumbs(), { text: savedSearch.title }]);
            }

            // set App state to clean
            store!.dispatch({ type: setSavedSearchId.type, payload: id });

            // starts syncing `_g` portion of url with query services
            syncQueryStateWithUrl(query, osdUrlStateStorage);

            return { id };
          }
        } catch (error) {
          toastNotifications.addDanger({
            title: i18n.translate('discover.notifications.notSavedSearchTitle', {
              defaultMessage: `Search '{savedSearchTitle}' was not saved.`,
              values: {
                savedSearchTitle: savedSearch.title,
              },
            }),
            text: (error as Error).message,
          });

          // Reset the original title
          savedSearch.title = currentTitle;

          return { error };
        }
      };

      const saveModal = (
        <SavedObjectSaveModal
          onSave={onSave}
          onClose={() => {}}
          title={savedSearch.title}
          showCopyOnSave={!!savedSearch.id}
          objectType="search"
          description={i18n.translate('discover.localMenu.saveSaveSearchDescription', {
            defaultMessage:
              'Save your Discover search so you can use it in visualizations and dashboards',
          })}
          showDescription={false}
        />
      );
      showSaveModal(saveModal, core.i18n.Context);
    },
  };

  const openSearch = {
    id: 'open',
    label: i18n.translate('discover.localMenu.openTitle', {
      defaultMessage: 'Open',
    }),
    description: i18n.translate('discover.localMenu.openSavedSearchDescription', {
      defaultMessage: 'Open Saved Search',
    }),
    testId: 'discoverOpenButton',
    run: () => {
      const flyoutSession = services.overlays.openFlyout(
        toMountPoint(
          <OpenSearchDashboardsContextProvider services={services}>
            <OpenSearchPanel
              onClose={() => {
                if (flyoutSession) {
                  flyoutSession.close();
                }
              }}
              makeUrl={(searchId) => `#/view/${encodeURIComponent(searchId)}`}
            />
          </OpenSearchDashboardsContextProvider>
        )
      );
    },
  };

  const shareSearch: TopNavMenuData = {
    id: 'share',
    label: i18n.translate('discover.localMenu.shareTitle', {
      defaultMessage: 'Share',
    }),
    description: i18n.translate('discover.localMenu.shareSearchDescription', {
      defaultMessage: 'Share Search',
    }),
    testId: 'shareTopNavButton',
    run: async (anchorElement) => {
      const state: DiscoverState = store!.getState().discover; // store is defined before the view is loaded
      const sharingData = await getSharingData({
        searchSource: savedSearch.searchSource,
        state,
        services,
      });
      share?.toggleShareContextMenu({
        anchorElement,
        allowEmbed: false,
        allowShortUrl: capabilities.discover?.createShortUrl as boolean,
        shareableUrl: unhashUrl(window.location.href),
        objectId: savedSearch.id,
        objectType: 'search',
        sharingData: {
          ...sharingData,
          title: savedSearch.title,
        },
        isDirty: !savedSearch.id || state.isDirty || false,
      });
    },
  };

  const inspectSearch = {
    id: 'inspect',
    label: i18n.translate('discover.localMenu.inspectTitle', {
      defaultMessage: 'Inspect',
    }),
    description: i18n.translate('discover.localMenu.openInspectorForSearchDescription', {
      defaultMessage: 'Open Inspector for search',
    }),
    testId: 'openInspectorButton',
    run() {
      inspector.open(inspectorAdapters, {
        title: savedSearch?.title,
      });
    },
  };

  const newDiscoverButtonLabel = i18n.translate('discover.localMenu.discoverButton.label.new', {
    defaultMessage: 'Try new Discover',
  });
  const oldDiscoverButtonLabel = i18n.translate('discover.localMenu.discoverButton.label.old', {
    defaultMessage: 'Use legacy Discover',
  });
  const isNewDiscover = getNewDiscoverSetting(storage);
  const newTable: TopNavMenuData = {
    id: 'table-datagrid',
    label: isNewDiscover ? oldDiscoverButtonLabel : newDiscoverButtonLabel,
    description: i18n.translate('discover.localMenu.newTableDescription', {
      defaultMessage: 'New Discover toggle Experience',
    }),
    testId: 'datagridTableButton',
    run: async () => {
      // Read the current state from localStorage
      const newDiscoverEnabled = getNewDiscoverSetting(storage);
      if (newDiscoverEnabled) {
        const confirmed = await services.overlays.openConfirm(
          toMountPoint(
            <EuiText>
              <p>
                Help drive future improvements by{' '}
                <a href="https://survey.opensearch.org" target="_blank" rel="noopener noreferrer">
                  providing feedback
                </a>{' '}
                about your experience.
              </p>
            </EuiText>
          ),
          {
            title: i18n.translate('discover.localMenu.newTableConfirmModalTitle', {
              defaultMessage: 'Share your thoughts on the latest Discover features',
            }),
            cancelButtonText: 'Cancel',
            confirmButtonText: 'Turn off new features',
            defaultFocusedButton: 'confirm',
          }
        );

        if (confirmed) {
          setNewDiscoverSetting(false, storage);
          window.location.reload();
        }
      } else {
        // Save the new setting to localStorage
        setNewDiscoverSetting(true, storage);
        window.location.reload();
      }
    },
    iconType: isNewDiscover ? 'editorUndo' : 'cheer',
  };

  return [
    newTable,
    newSearch,
    ...(capabilities.discover?.save ? [saveSearch] : []),
    openSearch,
    ...(share ? [shareSearch] : []), // Show share option only if share plugin is available
    inspectSearch,
  ];
};

// TODO: This does not seem to affect the share menu. need to look into it in future
// const getFieldCounts = async () => {
//   // the field counts aren't set until we have the data back,
//   // so we wait for the fetch to be done before proceeding
//   if ($scope.fetchStatus === fetchStatuses.COMPLETE) {
//     return $scope.fieldCounts;
//   }

//   return await new Promise((resolve) => {
//     const unwatch = $scope.$watch('fetchStatus', (newValue) => {
//       if (newValue === fetchStatuses.COMPLETE) {
//         unwatch();
//         resolve($scope.fieldCounts);
//       }
//     });
//   });
// };

const getSharingDataFields = async (
  selectedFields: string[],
  hideTimeColumn: boolean,
  timeFieldName?: string
) => {
  if (selectedFields.length === 1 && selectedFields[0] === '_source') {
    // const fieldCounts = await getFieldCounts();
    return {
      searchFields: undefined,
      // selectFields: keys(fieldCounts).sort(),
    };
  }

  const fields =
    timeFieldName && !hideTimeColumn ? [timeFieldName, ...selectedFields] : selectedFields;
  return {
    searchFields: fields,
    selectFields: fields,
  };
};

const getSharingData = async ({
  searchSource,
  state,
  services,
}: {
  searchSource: ISearchSource;
  state: DiscoverState;
  services: DiscoverViewServices;
}) => {
  const searchSourceInstance = searchSource.createCopy();
  const indexPattern = await searchSourceInstance.getField('index');

  const { searchFields } = await getSharingDataFields(
    state.columns,
    services.uiSettings.get(DOC_HIDE_TIME_COLUMN_SETTING),
    indexPattern?.timeFieldName
  );

  searchSourceInstance.setField('fields', searchFields);
  searchSourceInstance.setField(
    'sort',
    getSortForSearchSource(
      state.sort,
      indexPattern,
      services.uiSettings.get(SORT_DEFAULT_ORDER_SETTING)
    )
  );
  searchSourceInstance.setField('highlight', null);
  searchSourceInstance.setField('highlightAll', undefined);
  searchSourceInstance.setField('aggs', null);
  searchSourceInstance.setField('size', undefined);

  const body = await searchSource.getSearchRequestBody();
  return {
    searchRequest: {
      index: indexPattern?.title,
      body,
    },
    // fields: selectFields,
    metaFields: indexPattern?.metaFields,
    conflictedTypesFields: indexPattern?.fields
      .filter((f) => f.type === 'conflict')
      .map((f) => f.name),
    indexPatternId: indexPattern?.id,
  };
};
