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
			left: '0.75rem',
			right: '0.75rem',
		},
		cursor: 'pointer',
		borderRadius: '0.5rem',

		Cover: {
			flex: {
				shrink: 0,
				grow: 0,
			},
			width: '3rem',
			height: '3rem',
			borderRadius: '4px',
			objectFit: 'cover',
		},

		Info: {
			flex: {
				direction: 'column',
				grow: 1,
				shrink: 1,
			},
			overflow: {
				x: 'hidden',
			},
			gap: '0.125rem',
		},

		Title: {
			font: {
				weight: 'bold',
				size: '0.875rem',
			},
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Artist: {
			font: {
				size: '0.8125rem',
			},
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Duration: {
			flex: {
				shrink: 0,
			},
			font: {
				size: '0.8125rem',
			},
			color: $mol_theme.shade,
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
