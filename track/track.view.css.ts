namespace $.$$ {
	$mol_style_define($bog_vk_track, {
		flex: {
			direction: 'row',
		},
		align: {
			items: 'center',
		},
		gap: $mol_gap.text,
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},
		borderRadius: '0.5rem',

		Cover_box: {
			flex: {
				shrink: 0,
				grow: 0,
			},
			width: '3rem',
			height: '3rem',
			borderRadius: '4px',
			overflow: { x: 'hidden', y: 'hidden' },
			cursor: 'pointer',
			justify: { content: 'center' },
			align: { items: 'center' },
		},

		Cover: {
			width: '100%',
			height: '100%',
			objectFit: 'cover',
		},

		Cover_placeholder: {
			width: '100%',
			height: '100%',
			background: {
				color: $mol_theme.line,
			},
			color: $mol_theme.shade,
			justify: {
				content: 'center',
			},
			align: {
				items: 'center',
			},
		},

		Info: {
			flex: {
				direction: 'column',
				grow: 1,
				shrink: 1,
			},
			minWidth: 0,
			gap: '0.125rem',
			cursor: 'pointer',
		},

		Title: {
			font: {
				weight: 500,
				size: '0.8125rem',
			},
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Artist: {
			font: {
				size: '0.75rem',
			},
			color: $mol_theme.shade,
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Duration: {
			font: {
				size: '0.6875rem',
			},
			color: $mol_theme.shade,
		},

		Download: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Delete: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Archive: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Restore: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Delete_forever: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		'@': {
			bog_vk_track_current: {
				true: {
					color: $mol_theme.focus,
				},
			},
		},
	})
}
